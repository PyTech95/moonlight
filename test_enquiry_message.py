#!/usr/bin/env python3
"""
Test enquiry endpoint with optional message field
Tests all validation scenarios for the new message field feature
"""
import requests
import uuid
import json

# Load backend URL from frontend/.env
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BACKEND_URL = line.split('=', 1)[1].strip()
            break

BASE_URL = f"{BACKEND_URL}/api"

class TestSession:
    """Manages cookies and headers for a test session"""
    def __init__(self):
        self.cookies = {}
        self.csrf_token = None
        self.user_data = None
    
    def get_headers(self, include_csrf=False):
        headers = {'Content-Type': 'application/json'}
        if include_csrf and self.csrf_token:
            headers['X-CSRF-Token'] = self.csrf_token
        return headers

def create_admin_session():
    """Create a demo admin session for verifying stored enquiries"""
    print("\n=== Creating Admin Session ===")
    
    session = TestSession()
    
    # First get a sandbox cookie
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    # Now authenticate as admin
    headers = session.get_headers()
    resp = requests.post(
        f"{BASE_URL}/auth/demo",
        json={"role": "admin"},
        headers=headers,
        cookies=session.cookies
    )
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Admin auth failed with {resp.status_code}")
        print(f"Response: {resp.text}")
        return None
    
    session.cookies.update(resp.cookies.get_dict())
    data = resp.json()
    session.csrf_token = data.get('csrf')
    session.user_data = data
    
    print(f"✅ Admin session created: id={data.get('id')}, role={data.get('role')}")
    return session

def get_admin_enquiries(session: TestSession):
    """Get enquiries from admin workspace"""
    resp = requests.get(f"{BASE_URL}/admin/enquiries", cookies=session.cookies)
    if resp.status_code != 200:
        print(f"❌ FAILED: Admin enquiries GET failed with {resp.status_code}")
        return None
    return resp.json()

def test_1_valid_without_message():
    """Test 1: Valid submission WITHOUT message returns 201 with reference"""
    print("\n" + "="*60)
    print("TEST 1: Valid submission WITHOUT message")
    print("="*60)
    
    session = TestSession()
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    enquiry_data = {
        "guardian_name": "Rajesh Kumar",
        "phone": "+919812345678",
        "service": "Speech Therapy",
        "contact_time": "Any time",
        "contact_preference": "Phone",
        "consent": True,
        "source": "Online Classes page",
        "country": "India"
    }
    
    idempotency_key = str(uuid.uuid4())
    headers = session.get_headers()
    headers['Idempotency-Key'] = idempotency_key
    
    resp = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"POST /api/enquiries -> {resp.status_code}")
    print(f"Request body: {json.dumps(enquiry_data, indent=2)}")
    
    if resp.status_code != 201:
        print(f"❌ FAILED: Expected 201, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False, None
    
    data = resp.json()
    reference = data.get('reference')
    print(f"Response: {json.dumps(data, indent=2)}")
    
    if not reference or not reference.startswith('MN-'):
        print(f"❌ FAILED: Invalid reference format: {reference}")
        return False, None
    
    print(f"✅ PASS: Enquiry created without message, reference={reference}")
    return True, reference

def test_2_valid_with_message():
    """Test 2: Valid submission WITH message returns 201 and is stored"""
    print("\n" + "="*60)
    print("TEST 2: Valid submission WITH message")
    print("="*60)
    
    # Create a session and get sandbox cookie
    session = TestSession()
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    enquiry_data = {
        "guardian_name": "Priya Mehta",
        "phone": "+919876543210",
        "service": "Occupational Therapy",
        "contact_time": "Morning",
        "contact_preference": "Phone",
        "consent": True,
        "source": "Online Classes page",
        "country": "India",
        "message": "We are visiting from Dubai and want online sessions for our 5-year-old daughter."
    }
    
    idempotency_key = str(uuid.uuid4())
    headers = session.get_headers()
    headers['Idempotency-Key'] = idempotency_key
    
    resp = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"POST /api/enquiries -> {resp.status_code}")
    print(f"Request body: {json.dumps(enquiry_data, indent=2)}")
    
    if resp.status_code != 201:
        print(f"❌ FAILED: Expected 201, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False, None, None
    
    # Update cookies from response
    session.cookies.update(resp.cookies.get_dict())
    
    data = resp.json()
    reference = data.get('reference')
    enquiry_id = data.get('id')
    print(f"Response: {json.dumps(data, indent=2)}")
    
    if not reference or not reference.startswith('MN-'):
        print(f"❌ FAILED: Invalid reference format: {reference}")
        return False, None, None
    
    print(f"✅ Enquiry created with message, reference={reference}, id={enquiry_id}")
    
    # Now authenticate as admin using the SAME session (same org_id)
    print("\n--- Authenticating as admin in same session ---")
    headers = session.get_headers()
    resp = requests.post(
        f"{BASE_URL}/auth/demo",
        json={"role": "admin"},
        headers=headers,
        cookies=session.cookies
    )
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Admin auth failed with {resp.status_code}")
        print(f"Response: {resp.text}")
        return False, reference, None
    
    session.cookies.update(resp.cookies.get_dict())
    auth_data = resp.json()
    session.csrf_token = auth_data.get('csrf')
    print(f"✅ Admin authenticated: id={auth_data.get('id')}, role={auth_data.get('role')}")
    
    # Now get enquiries from admin workspace
    print("\n--- Retrieving enquiries from admin workspace ---")
    resp = requests.get(f"{BASE_URL}/admin/enquiries", cookies=session.cookies)
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Admin enquiries GET failed with {resp.status_code}")
        print(f"Response: {resp.text}")
        return False, reference, None
    
    enquiries_data = resp.json()
    items = enquiries_data.get('items', [])
    print(f"Found {len(items)} enquiries in admin workspace")
    
    # Find our enquiry
    found_enquiry = None
    for item in items:
        if item.get('id') == enquiry_id:
            found_enquiry = item
            break
    
    if not found_enquiry:
        print(f"❌ FAILED: Enquiry {enquiry_id} not found in admin workspace")
        print(f"Available enquiry IDs: {[item.get('id') for item in items]}")
        return False, reference, None
    
    print(f"Found enquiry: {json.dumps(found_enquiry, indent=2)}")
    
    # Verify message and source are present
    stored_message = found_enquiry.get('message')
    stored_source = found_enquiry.get('source')
    
    if stored_message != enquiry_data['message']:
        print(f"❌ FAILED: Message mismatch. Expected: '{enquiry_data['message']}', Got: '{stored_message}'")
        return False, reference, found_enquiry
    
    if stored_source != enquiry_data['source']:
        print(f"❌ FAILED: Source mismatch. Expected: '{enquiry_data['source']}', Got: '{stored_source}'")
        return False, reference, found_enquiry
    
    print(f"✅ PASS: Message and source correctly stored")
    print(f"  - Message: {stored_message}")
    print(f"  - Source: {stored_source}")
    return True, reference, found_enquiry

def test_3_message_too_long():
    """Test 3: Message longer than 1000 characters returns 422"""
    print("\n" + "="*60)
    print("TEST 3: Message longer than 1000 characters")
    print("="*60)
    
    session = TestSession()
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    long_message = "A" * 1001  # 1001 characters
    
    enquiry_data = {
        "guardian_name": "Amit Singh",
        "phone": "+919123456789",
        "service": "ABA Therapy",
        "contact_time": "Evening",
        "contact_preference": "Phone",
        "consent": True,
        "source": "Therapy at Home page",
        "country": "India",
        "message": long_message
    }
    
    idempotency_key = str(uuid.uuid4())
    headers = session.get_headers()
    headers['Idempotency-Key'] = idempotency_key
    
    resp = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"POST /api/enquiries (message length={len(long_message)}) -> {resp.status_code}")
    
    if resp.status_code != 422:
        print(f"❌ FAILED: Expected 422, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    print(f"Response: {resp.text}")
    print(f"✅ PASS: Long message correctly rejected with 422")
    return True

def test_4_validation_consent_false():
    """Test 4a: consent=false returns 422"""
    print("\n" + "="*60)
    print("TEST 4a: Validation - consent=false")
    print("="*60)
    
    session = TestSession()
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    enquiry_data = {
        "guardian_name": "Neha Gupta",
        "phone": "+919234567890",
        "service": "Speech Therapy",
        "contact_time": "Any time",
        "contact_preference": "Phone",
        "consent": False,  # Invalid
        "source": "Website",
        "country": "India"
    }
    
    idempotency_key = str(uuid.uuid4())
    headers = session.get_headers()
    headers['Idempotency-Key'] = idempotency_key
    
    resp = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"POST /api/enquiries (consent=false) -> {resp.status_code}")
    
    if resp.status_code != 422:
        print(f"❌ FAILED: Expected 422, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    print(f"Response: {resp.text}")
    print(f"✅ PASS: consent=false correctly rejected with 422")
    return True

def test_4_validation_invalid_phone():
    """Test 4b: Invalid phone (no country code) returns 422"""
    print("\n" + "="*60)
    print("TEST 4b: Validation - invalid phone (no country code)")
    print("="*60)
    
    session = TestSession()
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    enquiry_data = {
        "guardian_name": "Vikram Patel",
        "phone": "9812345678",  # Missing country code
        "service": "Speech Therapy",
        "contact_time": "Any time",
        "contact_preference": "Phone",
        "consent": True,
        "source": "Website",
        "country": "India"
    }
    
    idempotency_key = str(uuid.uuid4())
    headers = session.get_headers()
    headers['Idempotency-Key'] = idempotency_key
    
    resp = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"POST /api/enquiries (phone without country code) -> {resp.status_code}")
    
    if resp.status_code != 422:
        print(f"❌ FAILED: Expected 422, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    print(f"Response: {resp.text}")
    print(f"✅ PASS: Invalid phone correctly rejected with 422")
    return True

def test_4_validation_invalid_service():
    """Test 4c: Invalid service (not in allowed list) returns 422"""
    print("\n" + "="*60)
    print("TEST 4c: Validation - invalid service")
    print("="*60)
    
    session = TestSession()
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    enquiry_data = {
        "guardian_name": "Sanjay Reddy",
        "phone": "+919345678901",
        "service": "Online Classes",  # Not a valid therapy service
        "contact_time": "Any time",
        "contact_preference": "Phone",
        "consent": True,
        "source": "Online Classes page",
        "country": "India"
    }
    
    idempotency_key = str(uuid.uuid4())
    headers = session.get_headers()
    headers['Idempotency-Key'] = idempotency_key
    
    resp = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"POST /api/enquiries (service='Online Classes') -> {resp.status_code}")
    
    if resp.status_code != 422:
        print(f"❌ FAILED: Expected 422, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    print(f"Response: {resp.text}")
    print(f"✅ PASS: Invalid service correctly rejected with 422")
    return True

def test_5_unknown_field():
    """Test 5: Unknown extra field rejected (422)"""
    print("\n" + "="*60)
    print("TEST 5: Unknown extra field rejected")
    print("="*60)
    
    session = TestSession()
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    enquiry_data = {
        "guardian_name": "Kavita Sharma",
        "phone": "+919456789012",
        "service": "Speech Therapy",
        "contact_time": "Any time",
        "contact_preference": "Phone",
        "consent": True,
        "source": "Website",
        "country": "India",
        "nickname": "x"  # Unknown field
    }
    
    idempotency_key = str(uuid.uuid4())
    headers = session.get_headers()
    headers['Idempotency-Key'] = idempotency_key
    
    resp = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"POST /api/enquiries (with unknown field 'nickname') -> {resp.status_code}")
    
    if resp.status_code != 422:
        print(f"❌ FAILED: Expected 422, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    print(f"Response: {resp.text}")
    print(f"✅ PASS: Unknown field correctly rejected with 422")
    return True

def test_6_idempotency():
    """Test 6: Idempotency-Key validation and behavior"""
    print("\n" + "="*60)
    print("TEST 6: Idempotency-Key validation")
    print("="*60)
    
    session = TestSession()
    resp = requests.get(f"{BASE_URL}/public/settings")
    session.cookies.update(resp.cookies.get_dict())
    
    enquiry_data = {
        "guardian_name": "Deepak Verma",
        "phone": "+919567890123",
        "service": "Sensory Integration Therapy",
        "contact_time": "Afternoon",
        "contact_preference": "Phone",
        "consent": True,
        "source": "Therapy at Home page",
        "country": "India"
    }
    
    # Test 6a: Missing Idempotency-Key
    print("\n--- Test 6a: Missing Idempotency-Key ---")
    headers = session.get_headers()
    # No Idempotency-Key header
    
    resp = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"POST /api/enquiries (no Idempotency-Key) -> {resp.status_code}")
    
    if resp.status_code != 422:
        print(f"❌ FAILED 6a: Expected 422, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    print(f"Response: {resp.text}")
    print(f"✅ PASS 6a: Missing Idempotency-Key correctly rejected with 422")
    
    # Test 6b: Reusing same key with identical body returns same reference
    print("\n--- Test 6b: Reusing same key with identical body ---")
    idempotency_key = str(uuid.uuid4())
    headers['Idempotency-Key'] = idempotency_key
    
    # First request
    resp1 = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"First POST /api/enquiries -> {resp1.status_code}")
    
    if resp1.status_code != 201:
        print(f"❌ FAILED 6b: First request failed with {resp1.status_code}")
        print(f"Response: {resp1.text}")
        return False
    
    data1 = resp1.json()
    reference1 = data1.get('reference')
    print(f"First response: {json.dumps(data1, indent=2)}")
    
    # Second request with same key and body
    resp2 = requests.post(
        f"{BASE_URL}/enquiries",
        json=enquiry_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"Second POST /api/enquiries (same key, same body) -> {resp2.status_code}")
    
    if resp2.status_code != 201:
        print(f"❌ FAILED 6b: Second request failed with {resp2.status_code}")
        print(f"Response: {resp2.text}")
        return False
    
    data2 = resp2.json()
    reference2 = data2.get('reference')
    print(f"Second response: {json.dumps(data2, indent=2)}")
    
    if reference1 != reference2:
        print(f"❌ FAILED 6b: References don't match. First: {reference1}, Second: {reference2}")
        return False
    
    print(f"✅ PASS 6b: Same reference returned for idempotent request: {reference1}")
    
    # Test 6c: Reusing same key with different body returns 409
    print("\n--- Test 6c: Reusing same key with different body ---")
    different_data = enquiry_data.copy()
    different_data['guardian_name'] = "Different Name"
    
    resp3 = requests.post(
        f"{BASE_URL}/enquiries",
        json=different_data,
        headers=headers,
        cookies=session.cookies
    )
    
    print(f"Third POST /api/enquiries (same key, different body) -> {resp3.status_code}")
    
    if resp3.status_code != 409:
        print(f"❌ FAILED 6c: Expected 409, got {resp3.status_code}")
        print(f"Response: {resp3.text}")
        return False
    
    print(f"Response: {resp3.text}")
    print(f"✅ PASS 6c: Conflict correctly returned with 409")
    
    return True

def main():
    """Run all enquiry message field tests"""
    print("=" * 60)
    print("ENQUIRY MESSAGE FIELD TESTING")
    print("=" * 60)
    print(f"Backend URL: {BASE_URL}")
    
    results = {}
    references_created = []
    
    # Test 1: Valid without message
    result, reference = test_1_valid_without_message()
    results['test_1_valid_without_message'] = result
    if reference:
        references_created.append(reference)
    
    # Test 2: Valid with message (and verify storage)
    result, reference, enquiry = test_2_valid_with_message()
    results['test_2_valid_with_message'] = result
    if reference:
        references_created.append(reference)
    
    # Test 3: Message too long
    results['test_3_message_too_long'] = test_3_message_too_long()
    
    # Test 4: Validation still enforced
    results['test_4a_consent_false'] = test_4_validation_consent_false()
    results['test_4b_invalid_phone'] = test_4_validation_invalid_phone()
    results['test_4c_invalid_service'] = test_4_validation_invalid_service()
    
    # Test 5: Unknown field rejected
    results['test_5_unknown_field'] = test_5_unknown_field()
    
    # Test 6: Idempotency
    results['test_6_idempotency'] = test_6_idempotency()
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_flag in results.items():
        status = "✅ PASS" if passed_flag else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("\n" + "=" * 60)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("=" * 60)
    
    if references_created:
        print("\nReferences created during testing:")
        for ref in references_created:
            print(f"  - {ref}")
    
    return passed == total

if __name__ == '__main__':
    success = main()
    exit(0 if success else 1)
