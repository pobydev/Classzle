import requests
import io
import openpyxl
from openpyxl import Workbook
from openpyxl.writer.excel import save_virtual_workbook

BASE_URL = "http://localhost:3000"
PARSE_ENDPOINT = f"{BASE_URL}/parseExcelFile"
TIMEOUT = 30


def create_excel_file(data_rows):
    wb = Workbook()
    ws = wb.active
    headers = ["name", "gender", "academic_score", "behavior_type"]
    ws.append(headers)
    for row in data_rows:
        ws.append(row)
    return io.BytesIO(save_virtual_workbook(wb))


def test_parseexcelfile_valid_and_invalid_files():
    # Test cases data
    test_cases = [
        # NaN values in academic_score field
        {
            "desc": "NaN values in academic_score",
            "rows": [
                ["Alice", "F", "abc", "행동(-1)"],
                ["Bob", "M", "", "행동(-2)"],
                ["Cara", "F", None, "행동(-3)"],
            ],
            "expect_default_score": True,
            "expected_http_status": 200,
        },
        # Invalid behavior type strings
        {
            "desc": "Invalid behavior_type string",
            "rows": [
                ["Dave", "M", 600, "행동(3)"],  # Missing minus sign
                ["Eva", "F", 550, "invalid_behavior"],
            ],
            "expect_default_score": False,
            "expected_http_status": 200,
        },
        # Missing required fields (name, gender)
        {
            "desc": "Missing required fields",
            "rows": [
                [None, "F", 700, "행동(-1)"],    # missing name
                ["Frank", None, 650, "행동(-2)"],  # missing gender
                [None, None, 600, "행동(-3)"],  # missing both
            ],
            "expect_error": True,
            "expected_http_status": 400,
        },
        # Special characters in student names
        {
            "desc": "Special characters in names",
            "rows": [
                ["Élise", "F", 720, "행동(-2)"],
                ["张伟", "M", 680, "행동(-1)"],
                ["O'Connor", "M", 690, "행동(-3)"],
                ["Anne-Marie", "F", 710, "행동(-2)"],
            ],
            "expect_default_score": False,
            "expected_http_status": 200,
        },
        # Corrupted Excel file (invalid format)
        {
            "desc": "Corrupted Excel file",
            "corrupted_content": b"not an excel file content",
            "expect_error": True,
            "expected_http_status": 400,
        },
    ]

    headers = {
        # Assuming application expects multipart/form-data with a file upload field 'file'
    }

    for case in test_cases:
        if "corrupted_content" in case:
            files = {
                "file": ("corrupted.xlsx", case["corrupted_content"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            }
        else:
            excel_file = create_excel_file(case["rows"])
            files = {
                "file": ("test.xlsx", excel_file.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            }

        try:
            response = requests.post(PARSE_ENDPOINT, files=files, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            assert case.get("expect_error", False), f"Unexpected request exception for case: {case['desc']} error: {e}"
            continue

        if case.get("expect_error", False):
            assert response.status_code >= 400, f"Expected error status for case: {case['desc']} but got {response.status_code}"
            continue

        assert response.status_code == case["expected_http_status"], f"Unexpected status code for case: {case['desc']}"

        # If success, validate response JSON data
        try:
            data = response.json()
        except ValueError:
            assert False, f"Response is not JSON for case: {case['desc']}"

        # The response should be a list of students
        assert isinstance(data, list), f"Response data is not a list for case: {case['desc']}"

        if case["desc"] == "Missing required fields":
            # Expecting error, but if not error test here no data validation needed
            continue

        for student in data:
            # Validate required fields exist
            assert "name" in student and student["name"] is not None, f"Missing 'name' in student for case: {case['desc']}"
            assert "gender" in student and student["gender"] is not None, f"Missing 'gender' in student for case: {case['desc']}"

            # Validate academic_score
            score = student.get("academic_score")
            if case.get("expect_default_score"):
                # NaN scores must be converted to 500 default
                # Here we allow either int or float 500
                assert score == 500, f"academic_score not defaulted to 500 for case: {case['desc']}, got {score}"
            else:
                # Score should be numeric and non-null
                assert isinstance(score, (int, float)), f"academic_score is not numeric for case: {case['desc']}, got {score}"

            # Validate behavior_type field string format
            behavior = student.get("behavior_type")
            if behavior is not None:
                # Valid format example: "행동(-1)"
                # Invalid example: "행동(3)" (missing minus)
                if behavior.startswith("행동(") and behavior.endswith(")"):
                    inside = behavior[3:-1]
                    # Must be integer string with minus sign for valid
                    if case["desc"] == "Invalid behavior_type string":
                        # This case tests invalid strings, so behavior could be invalid
                        # Just check that parser did not crash and returns string (already checked)
                        pass
                    else:
                        try:
                            val = int(inside)
                            assert val <= 0, f"behavior_type numeric not negative for case: {case['desc']}"
                        except Exception:
                            assert False, f"behavior_type string not parseable for case: {case['desc']}"
                else:
                    # Behavior string is invalid format
                    if case["desc"] != "Invalid behavior_type string":
                        assert False, f"behavior_type string invalid format for case: {case['desc']}"
    return


test_parseexcelfile_valid_and_invalid_files()