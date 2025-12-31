import requests
import json

BASE_URL = "http://localhost:3000"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}

def test_loadproject_state_restoration():
    # Define multiple test payloads to cover edge cases and defensive coding for loadProject
    
    test_payloads = [
        # 1. Missing required fields in students array (e.g., missing 'name', 'gender')
        {
            "description": "Missing required fields in students",
            "payload": {
                "students": [
                    {"id": "s1", "academic_score": 600},  # missing name, gender
                    {"id": "s2", "name": "Alice"}        # missing gender
                ],
                "groups": [],
                "settings": {}
            },
            "expected_status": 400
        },
        # 2. Invalid student IDs in avoid_ids/keep_ids (referential integrity)
        {
            "description": "Invalid student IDs in avoid_ids/keep_ids",
            "payload": {
                "students": [
                    {"id": "s1", "name": "Bob", "gender": "M", "academic_score": 550, "avoid_ids": ["invalid_id"], "keep_ids": ["s2"]},
                    {"id": "s2", "name": "Carol", "gender": "F", "academic_score": 580}
                ],
                "groups": [],
                "settings": {}
            },
            "expected_status": 400
        },
        # 3. group_ids referencing non-existent groups
        {
            "description": "Group IDs that don't exist in groups array",
            "payload": {
                "students": [
                    {"id": "s1", "name": "Dave", "gender": "M", "academic_score": 600, "group_ids": ["g1"]},
                    {"id": "s2", "name": "Eve", "gender": "F", "academic_score": 590}
                ],
                "groups": [
                    {"id": "g2", "name": "Group 2", "members": ["s2"]}
                ],
                "settings": {}
            },
            "expected_status": 400
        },
        # 4. Malformed JSON structure (will be tested by sending invalid JSON string)
        {
            "description": "Malformed JSON structure",
            "payload": '{ "students": [ { "id": "s1", "name": "Frank", "gender": "M" } ], "groups": [], "settings": ',  # invalid JSON string
            "expected_status": 400,
            "is_raw": True
        },
        # 5. Empty arrays for students and groups (should be accepted gracefully)
        {
            "description": "Empty students and groups arrays",
            "payload": {
                "students": [],
                "groups": [],
                "settings": {}
            },
            "expected_status": 200
        },
    ]

    url = f"{BASE_URL}/loadProject"
    for test in test_payloads:
        description = test["description"]
        expected_status = test["expected_status"]
        try:
            if test.get("is_raw"):
                # Send malformed JSON payload as raw data
                response = requests.post(url, headers=HEADERS, data=test["payload"], timeout=TIMEOUT)
            else:
                response = requests.post(url, headers=HEADERS, json=test["payload"], timeout=TIMEOUT)

            # Assert status code
            assert response.status_code == expected_status, (
                f"FAIL {description}: Expected status {expected_status}, got {response.status_code}. Response: {response.text}"
            )

            if response.status_code == 200:
                # On success verify response JSON includes indication of state update or empty response
                try:
                    res_json = response.json()
                    # we expect no error and possibly an indication of loaded state
                    assert isinstance(res_json, dict), f"FAIL {description}: Response JSON is not an object."
                except Exception as e:
                    assert False, f"FAIL {description}: Unable to parse JSON response. Exception: {e}"

        except requests.exceptions.RequestException as e:
            assert False, f"FAIL {description}: Request failed with exception: {e}"

test_loadproject_state_restoration()