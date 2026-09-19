#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: "Deploy the Moonlight Neurocare app. Deploy failed because backend/.env (and frontend/.env) were missing/gitignored, causing backend crash-loop (KeyError MONGO_URL, DATA_ENCRYPTION_KEY) and deployer pull_source failure."

backend:
  - task: "Recreate missing .env files and verify backend boots + core APIs work"
    implemented: true
    working: true
    file: "backend/.env, backend/config.py, backend/vault.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Recreated backend/.env (MONGO_URL, DB_NAME, WEB_ORIGIN, PREVIEW_PROXY_ORIGIN, APP_MODE=demo, generated DATA_ENCRYPTION_KEY Fernet key) and frontend/.env (REACT_APP_BACKEND_URL). Backend now boots; /api/health returns ok. Need smoke verification of core public + auth/demo portal endpoints after env recreation. Note: object storage init returns 400 in preview (deferred, non-fatal)."
        -working: true
        -agent: "testing"
        -comment: "Backend smoke test completed successfully. All 13 tests passed: (1) Health endpoint returns correct response with status=ok, mode=demo, stage=A. (2) Public endpoints working: settings, reviews, enquiry creation with idempotency. (3) Demo auth flow working for all roles (parent, staff, admin) - creates demo sessions correctly. (4) Authenticated endpoints working: /auth/me, workspace endpoints for all roles return proper data with children/appointments/activities. (5) Admin endpoints working: enquiries list, settings retrieval. Object storage init returns 400 as expected (deferred, non-fatal). No 5xx errors encountered. Origin-check middleware working correctly (requires no Origin header or matching origin)."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Recreate missing .env files and verify backend boots + core APIs work"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "Backend crash was due to missing .env files (gitignored, lost). Recreated both. Backend healthy now. Please run a backend smoke test: GET /api/health, key public endpoints (home/practice content, locations/enquiry create), and the demo portal/auth flow if reachable without external creds. This is a demo app (APP_MODE=demo, passwordless per-browser demo portal). Do NOT test object storage/video upload (storage init returns 400 in preview - known, deferred). Report any 5xx or origin-check 403 issues."
    -agent: "testing"
    -message: "Backend smoke test completed successfully - all core APIs working after .env recreation. Tested: health check, public endpoints (settings/reviews/enquiry creation), demo auth flow for all 3 roles (parent/staff/admin), authenticated workspace endpoints, and admin endpoints. All 13 tests passed with no 5xx errors. Object storage 400 error confirmed as expected/non-fatal. Origin-check middleware working correctly. Backend is fully functional and ready for deployment."

    status_history:
        -working: true
        -agent: "testing"
        -comment: "13/13 backend smoke tests passed after .env recreation. Health ok, public content, enquiry POST (no origin-check 403), demo auth for all 3 roles, workspace + admin endpoints all working. Object storage 400 confirmed deferred/non-fatal."
