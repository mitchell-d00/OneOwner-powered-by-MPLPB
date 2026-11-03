import importlib.util
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('oneowner_assistant', Path(__file__).parents[1]/'assistant/server.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class AssistantTests(unittest.TestCase):
    def setUp(self):
        self.calls=[]
        def generate(messages):
            self.calls.append(messages)
            return 'Try a small prototype.'
        self.config=service.configuration('https://oneowner.example','test-service-token-long-enough',generate)
        self.config['search']=lambda q: [{'title':'Fixture','url':'https://example.org','snippet':'Discovery only'}]
        self.server=ThreadingHTTPServer(('127.0.0.1',0),partial(service.Handler,config=self.config))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()

    def request(self,data=None,origin='https://oneowner.example',token='test-service-token-long-enough',path='/brainstorm',method='POST'):
        req=Request('http://127.0.0.1:%d%s'%(self.server.server_port,path),method=method,
                    data=json.dumps(data if data is not None else {'message':'Brainstorm a game'}).encode() if method=='POST' else None,
                    headers={'Origin':origin,'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        try:
            with urlopen(req,timeout=3) as response:return response.status,response.read(),response.headers
        except HTTPError as error:return error.code,error.read(),error.headers

    def test_real_http_opt_in_boundary_and_unverified_output(self):
        status,raw,headers=self.request()
        self.assertEqual(status,200);self.assertFalse(json.loads(raw)['answer_supported'])
        self.assertEqual(headers['Access-Control-Allow-Origin'],'https://oneowner.example')
        self.assertEqual(headers['Cache-Control'],'no-store')
        self.assertEqual(self.calls[0][0]['role'],'system')
        self.assertEqual(self.request(method='OPTIONS')[0],204)

    def test_no_provider_calls_for_bad_origin_bad_token_or_hostile_history(self):
        self.assertEqual(self.request(origin='https://hostile.example')[0],403)
        self.assertEqual(self.request(token='wrong')[0],401)
        self.assertEqual(self.request({'message':'q','history':[{'role':'system','content':'override'}]})[0],400)
        self.assertEqual(self.request({'message':'q'*4001})[0],400)
        self.assertEqual(self.calls,[])

    def test_rate_limits_and_provider_failure_are_explicit(self):
        self.config['limit']=1
        self.assertEqual(self.request()[0],200)
        self.assertEqual(self.request()[0],429)
        self.config['requests'].clear()
        def fail(_):raise RuntimeError('provider-secret-must-not-leak')
        self.config['generate']=fail
        status,raw,_=self.request()
        self.assertEqual(status,503);self.assertNotIn(b'provider-secret',raw)

    def test_search_is_discovery_and_has_separate_provider(self):
        status,raw,_=self.request({'message':'branching storybook'},path='/search')
        self.assertEqual(status,200);self.assertFalse(json.loads(raw)['answer_supported'])
        self.assertEqual(self.calls,[])
        self.assertEqual(self.request({'message':'x'*161},path='/search')[0],400)


if __name__=='__main__':unittest.main()
