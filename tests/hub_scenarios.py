"""Finite, authored synthetic coverage; distinct scenarios, with disclosed template reuse."""
from itertools import product

PERSONAS=[
 ('policy researcher',['permit review','library access policy','parking exception','grant eligibility','public records checklist'],'community volunteers','preserve exceptions'),
 ('home cook',['bread schedule','lentil supper','pantry inventory','picnic menu','soup preparation'],'a family of four','avoid peanuts'),
 ('librarian',['book identification','reading club','archive catalogue','borrowing guide','shelf labels'],'new readers','retain title clues'),
 ('teacher',['fraction lesson','reading exercise','science worksheet','classroom routine','revision session'],'mixed ability learners','fit a short lesson'),
 ('gardener',['seedling plan','compost routine','watering schedule','balcony layout','harvest diary'],'beginner growers','use little water'),
 ('accessibility reviewer',['keyboard checklist','caption review','form audit','contrast review','navigation test'],'keyboard users','keep controls reachable'),
 ('student',['revision timetable','essay outline','citation notebook','study group','exam checklist'],'working students','reserve rest time'),
 ('local historian',['oral history plan','photo inventory','timeline exhibit','interview guide','street map notes'],'museum visitors','label uncertain dates'),
 ('game designer',['branching adventure','character worksheet','puzzle sequence','playtest plan','encounter outline'],'first time players','offer meaningful choices'),
 ('small business owner',['stock checklist','service menu','delivery plan','customer survey','opening schedule'],'local customers','respect a fixed budget'),
 ('maker',['repair checklist','workbench layout','prototype plan','tool inventory','assembly guide'],'workshop beginners','use available tools'),
 ('event organizer',['registration flow','venue checklist','volunteer rota','weather backup','speaker schedule'],'community attendees','include a quiet space'),
 ('care coordinator',['appointment planner','contact notebook','transport options','meal rota','question list'],'family carers','protect personal details'),
 ('fiction writer',['mystery outline','setting notebook','dialogue exercise','character arc','ending alternatives'],'young adult readers','keep motives consistent'),
 ('software maintainer',['release checklist','bug triage','upgrade notes','onboarding guide','incident handoff'],'new contributors','record unresolved risks'),
 ('citizen scientist',['bird survey','rainfall log','sampling plan','observation checklist','data dictionary'],'field volunteers','separate observation from inference'),
 ('sports coach',['practice schedule','equipment check','warmup plan','team notebook','progress review'],'junior players','allow recovery time'),
 ('travel planner',['walking itinerary','packing checklist','rail connection plan','museum route','contingency notes'],'a small travel group','allow extra transfer time'),
 ('family archivist',['recipe archive','photo labels','letter catalogue','family interview','keepsake inventory'],'future family readers','distinguish recollection from evidence'),
 ('community volunteer',['food collection','noticeboard plan','donation inventory','welcome pack','meeting agenda'],'new neighbours','make next steps clear'),
]

def scenarios():
    cases=[]
    for persona,projects,audience,constraint in PERSONAS:
      for project in projects:
        statements=[
          ('memory',f'Remember that my {project} must {constraint}.'),
          ('brainstorm',f'Brainstorm {project} for {audience}.'),
          ('task',f'/task Check the requirements for {project} so we can {constraint}.'),
          ('note',f'/note The audience for {project} is {audience}.'),
          ('decision',f'/decision Start {project} with one small example and {constraint}.'),
          ('recall',f'What do you remember about my {project}?'),
          ('missing_evidence',f'What source proves that {project} will {constraint}?'),
          ('planning',f'Help me plan {project} around the need to {constraint}.'),
          ('hypothetical',f'What if {project} had to serve twice as many people?'),
          ('clarification',f'Can you explain the limits of {project} for {audience}?'),
          ('summary',f'Summarize our plan for {project}, including how to {constraint}.'),
          ('goal',f'I need to collect unanswered questions for {project}.'),
          ('task',f'/task Ask {audience} to review the first version of {project}.'),
          ('note',f'/note We have not independently tested the outcomes of {project}.'),
          ('decision',f'/decision Keep uncertain claims about {project} separate from source evidence.'),
          ('brainstorm',f'Brainstorm a simpler {project} that can {constraint}.'),
          ('memory',f'Remember that {project} is intended for {audience}.'),
          ('evidence_question',f'Which details of {project} need supporting sources before I rely on them?'),
          ('alternatives',f'What alternatives could {project} offer {audience}?'),
          ('review',f'How should I check {project} before sharing it with {audience}?'),
        ]
        for intent,message in statements:cases.append({'persona':persona,'project':project,'intent':intent,'message':message})
    normalized=[' '.join(c['message'].casefold().split()) for c in cases]
    if len(cases)!=2000 or len(set(normalized))!=2000:raise AssertionError('The synthetic suite must contain exactly 2000 unique normalized user messages')
    return cases
