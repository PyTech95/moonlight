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