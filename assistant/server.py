#!/usr/bin/env python3
"""Optional OneOwner brainstorming service. Provider credentials stay server-side."""
import argparse
from collections import deque
from functools import partial
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlsplit

SYSTEM = ('You are the optional brainstorming companion for OneOwner. Help users explore ideas, '
          'clarify goals and plan source research. All your output is an unverified draft. '
          'Never claim to have searched, read, saved, sealed, or verified sources. You have no tools '
          'or access to the MPLPB ledger. Do not claim an idea is source-supported. '
          'Ask a useful clarification when needed. Keep replies concise.')


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('Expected a JSON object')
    message = data.get('message')
    history = data.get('history', [])
    if not isinstance(message, str) or not 1 <= len(message.strip()) <= 4000:
        raise ValueError('Message must be 1–4000 characters')
    if not isinstance(history, list) or len(history) > 8:
        raise ValueError('History must contain at most eight exchanges')
    turns = []
    for turn in history:
        if (not isinstance(turn, dict) or turn.get('role') not in ('user', 'assistant') or
                not isinstance(turn.get('content'), str) or len(turn['content']) > 4000):
            raise ValueError('Invalid history')
        turns.append({'role': turn['role'], 'content': turn['content']})
    return [{'role': 'system', 'content': SYSTEM}, *turns, {'role': 'user', 'content': message.strip()}]


def generate(messages):
    key = os.environ.get('OPENAI_API_KEY')
    model = os.environ.get('ONEOWNER_AI_MODEL')
    if not key or not model:
        raise RuntimeError('Assistant provider is not configured')
    request = Request('https://api.openai.com/v1/chat/completions', method='POST',
                      headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key},
                      data=json.dumps({'model': model, 'messages': messages, 'max_completion_tokens': 1200}).encode())
    with urlopen(request, timeout=35) as response:
        raw = response.read(100001)
    if len(raw) > 100000:
        raise RuntimeError('Provider reply too large')
    result = json.loads(raw)['choices'][0]['message']['content']
    if not isinstance(result, str) or not 1 <= len(result.strip()) <= 16000:
        raise RuntimeError('Invalid provider reply')
    return result


def search_web(query):
    key = os.environ.get('BRAVE_SEARCH_API_KEY')
    if not key:
        raise RuntimeError('Web search provider is not configured')
    request = Request('https://api.search.brave.com/res/v1/web/search?' + urlencode({'q': query, 'count': 6}),
                      headers={'X-Subscription-Token': key, 'Accept': 'application/json'})
    with urlopen(request, timeout=25) as response:
        raw = response.read(200001)
    if len(raw) > 200000:
        raise RuntimeError('Search response too large')
    results = []
    for item in json.loads(raw).get('web', {}).get('results', [])[:6]:
        url = item.get('url', '')
        parsed = urlsplit(url)
        if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password:
            results.append({'title': str(item.get('title', 'Web result'))[:200], 'url': url,
                            'snippet': str(item.get('description', ''))[:1200]})
    return results


class Handler(BaseHTTPRequestHandler):
    def __init__(self, *args, config, **kwargs):
        self.config = config
        super().__init__(*args, **kwargs)

    def log_message(self, *_):
        pass  # Do not log visitor messages, credentials or provider errors.

    def reply(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        if self.headers.get('Origin') == self.config['origin']:
            self.send_header('Access-Control-Allow-Origin', self.config['origin'])
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if self.path not in ('/brainstorm', '/search') or self.headers.get('Origin') != self.config['origin']:
            self.reply(403, {'error': 'Origin not allowed'})
            return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.config['origin'])
        self.send_header('Access-Control-Allow-Methods', 'POST')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Vary', 'Origin')
        self.end_headers()

    def do_POST(self):
        if self.path not in ('/brainstorm', '/search'):
            self.reply(404, {'error': 'Not found'})
            return
        if self.headers.get('Origin') != self.config['origin']:
            self.reply(403, {'error': 'Origin not allowed'})
            return
        expected = 'Bearer ' + self.config['token']
        if not hmac.compare_digest(self.headers.get('Authorization', '').encode(), expected.encode()):
            self.reply(401, {'error': 'Service access token required'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 1 <= size <= 40000:
                self.reply(413, {'error': 'Request too large or empty'})
                return
            if self.headers.get_content_type() != 'application/json':
                self.reply(415, {'error': 'Use application/json'})
                return
            data = json.loads(self.rfile.read(size))
            messages = validate(data)
            if self.path == '/search' and len(data['message']) > 160:
                raise ValueError('Query too long')
        except (ValueError, UnicodeError):
            self.reply(400, {'error': 'Invalid brainstorm request'})
            return
        now = time.monotonic()
        # Global per-service cap also bounds callers who rotate IPs; never trust X-Forwarded-For.
        with self.config['lock']:
            queue = self.config['requests']
            while queue and queue[0] < now - 60:
                queue.popleft()
            if len(queue) >= self.config['limit']:
                self.reply(429, {'error': 'Assistant busy; try again later'})
                return
            queue.append(now)
        if not self.config['slots'].acquire(blocking=False):
            self.reply(429, {'error': 'Assistant busy; try again later'})
            return
        try:
            if self.path == '/search':
                self.reply(200, {'results': self.config['search'](data['message']), 'answer_supported': False})
            else:
                result = self.config['generate'](messages)
                self.reply(200, {'message': result, 'answer_supported': False, 'kind': 'assisted_draft'})
        except (HTTPError, URLError, TimeoutError, RuntimeError, ValueError, KeyError, IndexError, OSError):
            self.reply(503, {'error': 'Assistant unavailable; sources were not changed'})
        finally:
            self.config['slots'].release()


def configuration(origin, token, generator=generate, limit=20):
    return {'origin': origin, 'token': token, 'generate': generator, 'limit': limit,
            'search': search_web, 'requests': deque(), 'lock': threading.Lock(), 'slots': threading.BoundedSemaphore(2)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8787)
    args = parser.parse_args()
    origin = os.environ.get('ONEOWNER_ALLOWED_ORIGIN', '')
    token = os.environ.get('ONEOWNER_ASSISTANT_TOKEN', '')
    if not origin.startswith(('https://', 'http://localhost:', 'http://127.0.0.1:')) or len(token) < 24:
        parser.error('Set ONEOWNER_ALLOWED_ORIGIN to the exact website origin and ONEOWNER_ASSISTANT_TOKEN to at least 24 characters')
    config = configuration(origin, token)
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, config=config))
    server.serve_forever()


if __name__ == '__main__':
    main()
