from datetime import datetime, timezone, timedelta
import secrets
import bcrypt
from config import db, uid, now

SETTINGS = {
    'name': 'Moonlight Neurocare', 'email': 'moonlightneurocare@gmail.com',
    'phone': '+91 7982282025', 'secondary_phone': '+91 8800672829',
    'address': 'First Floor, Plot No. 26B, opposite Alpine Convent School, near Param Ultrasound, Sector 37C, Gurugram, Haryana 122001',
    'timezone': 'Asia/Kolkata', 'verification_status': 'Pending center verification',
    'programs_published': False, 'integrations': {'payments': 'Not Configured', 'email': 'Not Configured', 'whatsapp': 'Not Configured', 'video': 'Not Configured', 'instagram': 'Not Configured'},
    'hero_images': [], 'director_photo': '', 'team': [], 'team_photo': '',
    'version': 1
}


async def seed_demo(org_id):
    # Deterministic IDs and upserts make concurrent demo entry harmless.
    for role, name in [('parent', 'Aarav’s family'), ('staff', 'Demo care professional'), ('admin', 'Demo administrator')]:
        user_id = f'{org_id}-{role}'
        await db.users.update_one({'org_id': org_id, 'id': user_id}, {'$setOnInsert': {
            'id': user_id, 'org_id': org_id, 'email': f'{role}@{org_id}.demo.invalid', 'display_name': name,
            'role': role, 'roles': [role], 'active': True,
            'password_hash': bcrypt.hashpw(secrets.token_bytes(32), bcrypt.gensalt()).decode()
        }}, upsert=True)
    await db.settings.update_one({'org_id': org_id}, {'$setOnInsert': {'org_id': org_id, **SETTINGS}}, upsert=True)
    children = [
        {'id': 'demo-aarav', 'name': 'Aarav', 'age_label': '5 years', 'initials': 'AA', 'guardian_ids': [f'{org_id}-parent'], 'staff_ids': [f'{org_id}-staff'], 'communication': 'Words, gestures and picture choices', 'goals': ['Express choices in everyday play', 'Explore everyday routines with support'], 'shared_summary': 'Aarav chose a favorite activity using a picture choice. We will keep offering different ways to communicate.'},
        {'id': 'demo-meera', 'name': 'Meera', 'age_label': '7 years', 'initials': 'MK', 'guardian_ids': ['unrelated-guardian'], 'staff_ids': [f'{org_id}-staff'], 'communication': 'Speech and visual instructions', 'goals': ['Participate in a preferred learning activity'], 'shared_summary': 'A short visual sequence supported participation in the classroom.'}
    ]
    for child in children:
        await db.children.update_one({'org_id': org_id, 'id': child['id']}, {'$setOnInsert': {**child, 'org_id': org_id, 'synthetic': True, 'version': 1}}, upsert=True)
    # Show actual dates; every schedule row is explicitly synthetic.
    today = datetime.now(timezone.utc).replace(hour=9, minute=0, second=0, microsecond=0)
    for index, (child, service, days, hour) in enumerate([('demo-aarav', 'Speech Therapy', 0, 0), ('demo-meera', 'Remedial Therapy', 0, 1), ('demo-aarav', 'Occupational Therapy', 1, 1), ('demo-aarav', 'Speech Therapy', 3, 0)]):
        record = {'id': f'demo-session-{index}', 'org_id': org_id, 'child_id': child, 'child_name': 'Aarav' if child == 'demo-aarav' else 'Meera', 'service': service, 'starts_at': (today + timedelta(days=days, hours=hour)).isoformat(), 'duration_minutes': 45, 'staff_label': 'Demo care professional', 'room': 'Demo room A', 'mode': 'At the center', 'status': 'Confirmed', 'attendance': 'Not recorded', 'version': 1, 'synthetic': True}
        await db.appointments.update_one({'org_id': org_id, 'id': record['id']}, {'$setOnInsert': record}, upsert=True)
    activity = {'id': 'demo-choice-play', 'org_id': org_id, 'child_id': 'demo-aarav', 'title': 'A little choice, a meaningful moment', 'category': 'Communication through play', 'instructions': 'Offer two familiar toys. Give your child time to choose using a word, gesture, picture or their preferred way of communicating. Follow their lead and enjoy the play together.', 'frequency': 'Demonstration activity only — not an individual therapy recommendation.', 'status': 'To try', 'feedback': '', 'version': 1}
    await db.activities.update_one({'org_id': org_id, 'id': activity['id']}, {'$setOnInsert': activity}, upsert=True)
    notice = {'id': 'demo-class-notice', 'org_id': org_id, 'child_id': 'demo-aarav', 'title': 'This week: the world around us', 'body': 'Our fictional classroom is exploring familiar colors, textures and everyday objects through child-led play.', 'category': 'Classroom update', 'created_at': now()}
    await db.announcements.update_one({'org_id': org_id, 'id': notice['id']}, {'$setOnInsert': notice}, upsert=True)
    await seed_school(org_id)


SCHOOL_USERS = [('school', 'Ms. Kavya Rao', 'demo-school-a', 'coordinator'), ('teacher', 'Mr. Rohan Mehta', 'demo-school-a', 'teacher'),
                ('teacherb', 'Ms. Neha Singh', 'demo-school-b', 'teacher')]


async def seed_school(org_id):
    later = lambda days: (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()  # noqa: E731
    for sid, name in [('demo-school-a', 'Sunrise Public School (fictional)'), ('demo-school-b', 'Riverside Academy (fictional)')]:
        await db.schools.update_one({'org_id': org_id, 'id': sid}, {'$setOnInsert': {
            'id': sid, 'org_id': org_id, 'name': name, 'address': 'Demonstration address, Gurugram', 'status': 'active', 'verified': True,
            'verified_at': now(), 'verified_by_name': 'Demo administrator', 'verification_note': 'Synthetic demo school',
            'coordinator': {'name': 'Demo coordinator', 'email': f'{sid}@{org_id}.demo.invalid', 'phone': ''}, 'created_at': now(), 'synthetic': True}}, upsert=True)
    for key, name, sid, school_role in SCHOOL_USERS:
        user_id = f'{org_id}-{key}'
        await db.users.update_one({'org_id': org_id, 'id': user_id}, {'$setOnInsert': {
            'id': user_id, 'org_id': org_id, 'email': f'{key}@{org_id}.demo.invalid', 'display_name': name, 'role': 'school', 'roles': ['school'],
            'access_profile': 'school_coordinator' if school_role == 'coordinator' else 'school_teacher', 'school_id': sid, 'school_role': school_role,
            'active': True, 'security_version': 1, 'password_hash': bcrypt.hashpw(secrets.token_bytes(32), bcrypt.gensalt()).decode()}}, upsert=True)
    parent = f'{org_id}-parent'
    approved = {'at': now(), 'by': parent, 'by_name': 'Aarav’s family', 'action': 'approved', 'scopes': ['profile', 'goals', 'activities', 'safety', 'messages'], 'duration_days': 180, 'signer': 'Aarav’s family'}
    links = [('demo-link-aarav-a', 'demo-aarav', 'Aarav', 'demo-school-a', 'Sunrise Public School (fictional)', parent, ['profile', 'goals', 'activities', 'safety', 'messages']),
             ('demo-link-meera-b', 'demo-meera', 'Meera', 'demo-school-b', 'Riverside Academy (fictional)', 'unrelated-guardian', ['profile', 'goals', 'activities', 'messages'])]
    for lid, cid, cname, sid, sname, guardian, scopes in links:
        await db.school_links.update_one({'org_id': org_id, 'id': lid}, {'$setOnInsert': {
            'id': lid, 'org_id': org_id, 'child_id': cid, 'child_name': cname, 'school_id': sid, 'school_name': sname, 'status': 'active',
            'purpose': 'Coordinate classroom support for everyday participation.', 'scopes': scopes, 'approved_video_ids': [], 'guardian_id': guardian,
            'requested_by': f'{org_id}-admin', 'requested_at': now(), 'approved_at': now(), 'expires_at': later(180), 'version': 1,
            'history': [{'at': now(), 'by': f'{org_id}-admin', 'by_name': 'Demo administrator', 'action': 'requested', 'note': 'Demo link request'}, {**approved, 'by': guardian}], 'synthetic': True}}, upsert=True)
    for aid, cid, cname, key, uname, sid, sname, group in [('demo-assign-aarav', 'demo-aarav', 'Aarav', 'teacher', 'Mr. Rohan Mehta', 'demo-school-a', 'Sunrise Public School (fictional)', 'Grade 1 · Section B'),
                                                           ('demo-assign-meera', 'demo-meera', 'Meera', 'teacherb', 'Ms. Neha Singh', 'demo-school-b', 'Riverside Academy (fictional)', 'Grade 2 · Section A')]:
        await db.school_assignments.update_one({'org_id': org_id, 'id': aid}, {'$setOnInsert': {
            'id': aid, 'org_id': org_id, 'school_id': sid, 'school_name': sname, 'child_id': cid, 'child_name': cname, 'user_id': f'{org_id}-{key}', 'user_name': uname,
            'school_role': 'teacher', 'class_group': group, 'status': 'active', 'proposed_by': f'{org_id}-school', 'proposed_by_name': 'Ms. Kavya Rao',
            'approved_by_name': 'Family (demo)', 'created_at': now(), 'decided_at': now(), 'synthetic': True}}, upsert=True)
    await db.children.update_one({'org_id': org_id, 'id': 'demo-aarav', 'support_profile': {'$exists': False}}, {'$set': {
        'support_profile': {'strengths': 'Curious, enjoys building and music, remembers routines well.', 'communication': 'Words, gestures and picture choices. Give extra time to respond.',
                            'sensory': 'May find loud, crowded spaces tiring.', 'regulation': 'A short movement break or quiet corner helps him reset.',
                            'helpful_strategies': 'Visual schedule, first–then cards, two clear choices.'},
        'safety': {'allergies': 'None recorded (demo)', 'safety_alerts': 'May leave the group when overwhelmed — keep a familiar adult nearby during transitions.', 'emergency_plan': 'Call the family, then the center. Fictional demonstration only.'}}})
    goals = [('demo-goal-choices', 'Express choices during class activities', 'Aarav will indicate a choice between two options using words, gestures or picture cards.', True,
              {'home': 'Offer two toys or snacks and wait 5 seconds.', 'school': 'Offer picture choices at circle time and free play.', 'therapy': 'Practice choice-making with preferred activities.'},
              'Makes a choice in 3 of 5 offered opportunities', 21),
             ('demo-goal-routines', 'Follow a short morning routine with a visual schedule', 'Aarav completes three routine steps with a visual schedule and minimal prompts.', False,
              {'home': 'Use the picture schedule for getting ready.', 'school': '', 'therapy': 'Model sequencing with first–then cards.'}, 'Completes 3 steps with up to one prompt', 35)]
    for gid, title, desc, visible, strategies, measure, days in goals:
        snapshot = {'title': title, 'description': desc, 'strategies': strategies, 'responsible': ['Demo care professional', 'Aarav’s family'] + (['Mr. Rohan Mehta'] if visible else []),
                    'review_date': later(days)[:10], 'progress_measure': measure, 'school_visible': visible}
        await db.support_goals.update_one({'org_id': org_id, 'id': gid}, {'$setOnInsert': {
            'id': gid, 'org_id': org_id, 'child_id': 'demo-aarav', **snapshot, 'status': 'published', 'version': 1, 'published_version': 1,
            'created_by': f'{org_id}-staff', 'created_by_name': 'Demo care professional', 'created_at': now(), 'updated_at': now(),
            'versions': [{'version': 1, 'by_name': 'Demo care professional', 'by_label': 'Therapist', 'at': now(), 'change_note': 'First published version', 'snapshot': snapshot}], 'synthetic': True}}, upsert=True)
    await db.school_activities.update_one({'org_id': org_id, 'id': 'demo-school-activity'}, {'$setOnInsert': {
        'id': 'demo-school-activity', 'org_id': org_id, 'child_id': 'demo-aarav', 'goal_id': 'demo-goal-choices', 'title': 'Choice board at circle time',
        'instructions': 'Hold up two picture cards (e.g. song or story). Wait up to 5 seconds. Accept a point, word or look as a choice and follow it.',
        'frequency': 'Once a day', 'duration': '2–3 minutes', 'materials': 'Two laminated picture cards', 'adaptations': 'Seat Aarav near the front; reduce to one card if he seems tired.',
        'precautions': 'Do not withhold the activity if no choice is made — model one and move on.', 'precautions_reviewed_by': 'Demo care professional',
        'media_video_id': '', 'status': 'published', 'author_name': 'Demo care professional', 'author_label': 'Therapist', 'created_at': now(), 'version': 1, 'synthetic': True}}, upsert=True)
    await db.team_meetings.update_one({'org_id': org_id, 'id': 'demo-meeting'}, {'$setOnInsert': {
        'id': 'demo-meeting', 'org_id': org_id, 'child_id': 'demo-aarav', 'title': 'Term check-in: classroom choices', 'proposed_for': later(6)[:16],
        'agenda': '1. What is working at school\n2. Home routines\n3. Next review date', 'status': 'scheduled', 'scheduled_for': later(6)[:16], 'minutes': '', 'actions': [],
        'review_date': '', 'author_id': f'{org_id}-staff', 'author_name': 'Demo care professional', 'author_label': 'Therapist', 'author_kind': 'therapist', 'school_id': '',
        'created_at': now(), 'attendees': [], 'version': 1, 'history': [], 'synthetic': True}}, upsert=True)