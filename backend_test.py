#!/usr/bin/env python3
"""
Backend smoke test for Moonlight Neurocare Stage A
Tests core public endpoints, demo auth flow, and authenticated workspace/admin endpoints
"""
import requests
import uuid
import json
from typing import Dict, Optional

# Load backend URL from frontend/.env
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BACKEND_URL = line.split('=', 1)[1].strip()
            break

BASE_URL = f"{BACKEND_URL}/api"
ORIGIN = BACKEND_URL

class TestSession:
    """Manages cookies and headers for a test session"""
    def __init__(self):
        self.cookies = {}
        self.csrf_token = None
        self.user_data = None
    
    def get_headers(self, include_csrf=False, include_origin=False):
        headers = {'Content-Type': 'application/json'}
        if include_csrf and self.csrf_token:
            headers['X-CSRF-Token'] = self.csrf_token
        if include_origin:
            headers['Origin'] = ORIGIN
        return headers

def test_health():
    """Test GET /api/health"""
    print("\n=== Testing Health Endpoint ===")
    resp = requests.get(f"{BASE_URL}/health")
    print(f"GET /api/health -> {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    
    if data.get('status') != 'ok' or data.get('mode') != 'demo' or data.get('stage') != 'A':
        print(f"❌ FAILED: Unexpected response data")
        return False
    
    print("✅ Health check passed")
    return True

def test_public_settings(session: TestSession):
    """Test GET /api/public/settings"""
    print("\n=== Testing Public Settings ===")
    resp = requests.get(f"{BASE_URL}/public/settings", cookies=session.cookies)
    print(f"GET /api/public/settings -> {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    # Update session cookies
    session.cookies.update(resp.cookies.get_dict())
    
    data = resp.json()
    print(f"Response keys: {list(data.keys())}")
    print("✅ Public settings retrieved")
    return True

def test_public_reviews(session: TestSession):
    """Test GET /api/public/reviews"""
    print("\n=== Testing Public Reviews ===")
    resp = requests.get(f"{BASE_URL}/public/reviews", cookies=session.cookies)
    print(f"GET /api/public/reviews -> {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    print(f"Response: configured={data.get('configured')}, reviews_count={len(data.get('reviews', []))}")
    print("✅ Public reviews retrieved")
    return True

def test_enquiry_creation(session: TestSession):
    """Test POST /api/enquiries"""
    print("\n=== Testing Enquiry Creation ===")
    
    enquiry_data = {
        "guardian_name": "Priya Sharma",
        "phone": "+919876543210",
        "email": "priya.sharma@example.com",
        "service": "Speech Therapy",
        "contact_time": "Morning",
        "contact_preference": "Phone",
        "consent": True,
        "source": "Website",
        "country": "India"
    }
    
    idempotency_key = str(uuid.uuid4())
    # Try without Origin header first (middleware allows requests without Origin)
    headers = session.get_headers(include_origin=False)
    headers['Idempotency-Key'] = idempotency_key
    
    resp = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    print(f"POST /api/enquiries -> {resp.status_code}")
    
    if resp.status_code == 403:
        print(f"❌ FAILED: Origin check rejected request (403)")
        print(f"Response: {resp.text}")
        return False
    
    if resp.status_code != 201:
        print(f"❌ FAILED: Expected 201, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    print(f"Response: id={data.get('id')}, reference={data.get('reference')}, status={data.get('status')}")
    print("✅ Enquiry created successfully")
    return True

def test_demo_auth(role: str) -> Optional[TestSession]:
    """Test POST /api/auth/demo and return authenticated session"""
    print(f"\n=== Testing Demo Auth ({role}) ===")
    
    session = TestSession()
    
    # First get a sandbox cookie
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    # Now authenticate (without Origin header - middleware allows this)
    headers = session.get_headers(include_origin=False)
    resp = requests.post(
        f"{BASE_URL}/auth/demo",
        json={"role": role},
        headers=headers,
        cookies=session.cookies
    )
    print(f"POST /api/auth/demo (role={role}) -> {resp.status_code}")
    
    if resp.status_code == 403:
        print(f"❌ FAILED: Origin check rejected request (403)")
        print(f"Response: {resp.text}")
        return None
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return None
    
    # Update session cookies (should include mnc_session now)
    session.cookies.update(resp.cookies.get_dict())
    
    data = resp.json()
    session.csrf_token = data.get('csrf')
    session.user_data = data
    
    print(f"Response: id={data.get('id')}, role={data.get('role')}, csrf={data.get('csrf')[:20]}...")
    print(f"✅ Demo auth successful for {role}")
    return session

def test_auth_me(session: TestSession):
    """Test GET /api/auth/me"""
    print("\n=== Testing Auth Me ===")
    resp = requests.get(f"{BASE_URL}/auth/me", cookies=session.cookies)
    print(f"GET /api/auth/me -> {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    print(f"Response: id={data.get('id')}, role={data.get('role')}, email={data.get('email')}")
    print("✅ Auth me endpoint working")
    return True

def test_workspace(session: TestSession, role: str):
    """Test GET /api/workspace/{role}"""
    print(f"\n=== Testing Workspace ({role}) ===")
    resp = requests.get(f"{BASE_URL}/workspace/{role}", cookies=session.cookies)
    print(f"GET /api/workspace/{role} -> {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    print(f"Response keys: {list(data.keys())}")
    print(f"Children: {len(data.get('children', []))}, Appointments: {len(data.get('appointments', []))}")
    print(f"✅ Workspace endpoint working for {role}")
    return True

def test_admin_enquiries(session: TestSession):
    """Test GET /api/admin/enquiries"""
    print("\n=== Testing Admin Enquiries ===")
    resp = requests.get(f"{BASE_URL}/admin/enquiries", cookies=session.cookies)
    print(f"GET /api/admin/enquiries -> {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    print(f"Response: items_count={len(data.get('items', []))}, offset={data.get('offset')}, limit={data.get('limit')}")
    print("✅ Admin enquiries endpoint working")
    return True

def test_admin_settings(session: TestSession):
    """Test GET /api/admin/settings"""
    print("\n=== Testing Admin Settings ===")
    resp = requests.get(f"{BASE_URL}/admin/settings", cookies=session.cookies)
    print(f"GET /api/admin/settings -> {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    if data:
        print(f"Response keys: {list(data.keys())}")
    else:
        print("Response: None (no settings configured yet)")
    print("✅ Admin settings endpoint working")
    return True

def main():
    """Run all backend tests"""
    print("=" * 60)
    print("MOONLIGHT NEUROCARE BACKEND SMOKE TEST")
    print("=" * 60)
    print(f"Backend URL: {BASE_URL}")
    print(f"Origin: {ORIGIN}")
    
    results = {}
    
    # Test 1: Health check
    results['health'] = test_health()
    
    # Test 2-4: Public endpoints
    public_session = TestSession()
    results['public_settings'] = test_public_settings(public_session)
    results['public_reviews'] = test_public_reviews(public_session)
    results['enquiry_creation'] = test_enquiry_creation(public_session)
    
    # Test 5-7: Demo auth for each role
    parent_session = test_demo_auth('parent')
    results['demo_auth_parent'] = parent_session is not None
    
    staff_session = test_demo_auth('staff')
    results['demo_auth_staff'] = staff_session is not None
    
    admin_session = test_demo_auth('admin')
    results['demo_auth_admin'] = admin_session is not None
    
    # Test 8-10: Authenticated endpoints (if auth succeeded)
    if parent_session:
        results['auth_me_parent'] = test_auth_me(parent_session)
        results['workspace_parent'] = test_workspace(parent_session, 'parent')
    
    if staff_session:
        results['workspace_staff'] = test_workspace(staff_session, 'staff')
    
    if admin_session:
        results['workspace_admin'] = test_workspace(admin_session, 'admin')
        results['admin_enquiries'] = test_admin_enquiries(admin_session)
        results['admin_settings'] = test_admin_settings(admin_session)
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_flag in results.items():
        status = "✅ PASS" if passed_flag else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("=" * 60)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("=" * 60)
    
    return passed == total

if __name__ == '__main__':
    success = main()
    exit(0 if success else 1)
