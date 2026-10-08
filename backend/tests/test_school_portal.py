import os

import pytest
import requests

BASE = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') + '/api'


def persona(role, demo_cookie=None):
    s = requests.Session()
    if demo_cookie:
        s.cookies.set('mnc_demo', demo_cookie)
    r = s.post(f'{BASE}/auth/demo', json={'role': role})
    assert r.status_code == 200, r.text
    s.headers['X-CSRF-Token'] = r.json()['csrf']
    return s


@pytest.fixture
def team():
    parent = persona('parent')
    cookie = parent.cookies.get('mnc_demo')
    return {'parent': parent, **{r: persona(r, cookie) for r in ['staff', 'admin', 'school', 'teacher', 'teacherb']}}


def test_school_isolation(team):
    teacher, teacherb, school = team['teacher'], team['teacherb'], team['school']
    assert teacher.get(f'{BASE}/team/children/demo-aarav').status_code == 200
    assert teacher.get(f'{BASE}/team/children/demo-meera').status_code == 404
    assert teacherb.get(f'{BASE}/team/children/demo-aarav').status_code == 404
    assert teacherb.get(f'{BASE}/team/children/demo-meera').status_code == 200
    # coordinator is a school member but is not assigned to Aarav
    assert school.get(f'{BASE}/team/children/demo-aarav').status_code == 404
    ws = school.get(f'{BASE}/school/workspace').json()
    assert [c['child_id'] for c in ws['linked_children']] == ['demo-aarav']
    assert teacher.get(f'{BASE}/workspace/staff').status_code == 403
    assert teacher.get(f'{BASE}/admin/schools').status_code == 403


def test_scoped_bundle_and_family_videos(team):
    data = team['teacher'].get(f'{BASE}/team/children/demo-aarav').json()
    assert data['viewer']['kind'] == 'school'
    assert [g['id'] for g in data['goals']] == ['demo-goal-choices']
    assert 'documents' not in data and 'tasks' not in data and 'shared_videos' not in data
    assert team['teacher'].get(f'{BASE}/practice-videos/anything/media').status_code in (403, 404)


def test_observation_guidance_and_contributions(team):
    t = team['teacher']
    obs = t.post(f'{BASE}/team/children/demo-aarav/observations', json={'observed_on': '2026-06-01', 'participation': 'Joined circle time for 5 minutes.',
                                                                          'needs_guidance': True, 'guidance_question': 'How can I support transitions?'})
    assert obs.status_code == 201, obs.text
    tasks = team['staff'].get(f'{BASE}/team/children/demo-aarav').json()['tasks']
    assert any(task['source_id'] == obs.json()['id'] and task['kind'] == 'guidance' for task in tasks)
    prop = t.post(f'{BASE}/team/children/demo-aarav/goals/demo-goal-choices/contributions', json={'kind': 'proposal', 'context': 'school', 'body': 'Try three cards.'})
    assert prop.json()['status'] == 'pending_review'
    team['parent'].post(f'{BASE}/team/children/demo-aarav/goals/demo-goal-choices/contributions', json={'kind': 'observation', 'context': 'home', 'body': 'Chose a snack at home.'})
    goal = next(g for g in team['staff'].get(f'{BASE}/team/children/demo-aarav').json()['goals'] if g['id'] == 'demo-goal-choices')
    kinds = {c['author_kind'] for c in goal['contributions']}
    assert {'school', 'parent'} <= kinds
    assert t.patch(f'{BASE}/team/children/demo-aarav/goals/demo-goal-choices', json={}).status_code in (403, 422)
    stale = team['staff'].patch(f'{BASE}/team/children/demo-aarav/goals/demo-goal-choices', json={
        'title': 'x' * 5, 'description': 'desc here', 'strategies': {}, 'review_date': '2026-09-01', 'progress_measure': 'measure', 'version': 99, 'change_note': 'test'})
    assert stale.status_code == 409


def test_withdrawal_blocks_access_and_transfer(team):
    parent, teacher = team['parent'], team['teacher']
    teacher.post(f'{BASE}/team/children/demo-aarav/messages', json={'body': 'Hello team', 'recipients_confirmed': True})
    link = next(l for l in parent.get(f'{BASE}/sharing/school').json()['links'] if l['child_id'] == 'demo-aarav' and l['status'] == 'active')
    r = parent.post(f'{BASE}/sharing/school/links/{link["id"]}/withdraw', json={'reason': 'Testing withdrawal'})
    assert r.status_code == 200
    assert teacher.get(f'{BASE}/team/children/demo-aarav').status_code == 404
    history = parent.get(f'{BASE}/sharing/school').json()
    assert any(l['status'] == 'withdrawn' for l in history['links'])
    assert parent.get(f'{BASE}/team/children/demo-aarav').status_code == 200
    moved = team['admin'].post(f'{BASE}/admin/children/demo-aarav/transfer', json={'to_school_id': 'demo-school-b', 'reason': 'Family moved', 'purpose': 'Continue classroom support'})
    assert moved.status_code == 200, moved.text
    assert team['teacherb'].get(f'{BASE}/team/children/demo-aarav').status_code == 404
    obs = team['staff'].get(f'{BASE}/team/children/demo-aarav').json()['observations']
    assert isinstance(obs, list)
