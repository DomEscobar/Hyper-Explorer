# Explorer user journeys

Defines the explorations the hyper-explorer runs. Each journey has a **goal** (string passed to the planner), which drives plan decomposition (e.g. `register` → find auth, fill form, submit, verify).

Use with the MCP explorer: pass goals on the CLI, or use `--journeys` to load all goals from this file.

```bash
node src/hyper-explorer-mcp.mjs <APP_URL> --journeys
node src/hyper-explorer-mcp.mjs <APP_URL> complete_registration login
# Or omit URL to use default from config: node src/hyper-explorer-mcp.mjs --journeys
```

---

## UJ-01: Max coverage

**Goal:** explore_max_coverage  
**Priority:** high  
**Description:** Maximize graph coverage; discover all reachable states (target 80%+). Planner uses `maximize_coverage` subtask.

---

## UJ-02: Complete registration

**Goal:** complete_registration  
**Priority:** critical  
**Description:** Find registration entry, fill form, submit, verify redirect to dashboard or welcome. Planner: find_auth_page → fill_form → submit → verify_success.

---

## UJ-03: Login (existing user)

**Goal:** login  
**Priority:** critical  
**Description:** Find login form, enter credentials, submit, verify dashboard. Planner: find_auth_page → fill_form → submit → verify_dashboard.

---

## UJ-04: Register then login then explore

**Goal:** register,login,explore_max_coverage  
**Priority:** high  
**Description:** Full flow: register → login → then maximize coverage. Planner picks first matching pattern (register) and runs that plan; run as a sequence by listing multiple goals in one run.

---

## UJ-05: New user registration flow (EmpoweredPixels-style)

**Goal:** register_new_user_complete_flow  
**Priority:** critical  
**Description:** End-to-end new user: register, land on dashboard. Planner treats as register (contains "register").

---

## UJ-06: Existing user login (EmpoweredPixels-style)

**Goal:** login_existing_user_successful_login  
**Priority:** critical  
**Description:** Login with valid credentials, verify dashboard. Planner treats as login.

---

## UJ-07: Create fighter / roster

**Goal:** create_fighter_squad  
**Priority:** high  
**Description:** After auth, create a fighter or squad. Planner uses explore_depth with goal name.

---

## UJ-08: Start and complete match

**Goal:** start_and_complete_match  
**Priority:** critical  
**Description:** Navigate to matches, join, complete match flow. Planner uses explore_depth.

---

## UJ-09: Navigate all authenticated pages

**Goal:** navigate_all_authenticated_pages  
**Priority:** high  
**Description:** With auth, hit roster, matches, inventory, leagues, squads. Planner uses explore_depth.

---

## UJ-10: Auth guard redirects

**Goal:** verify_auth_guard_redirects  
**Priority:** high  
**Description:** While logged out, access protected routes; expect redirect to login. Planner uses explore_depth.

---

## UJ-11: Reset password

**Goal:** reset password  
**Priority:** medium  
**Description:** Find forgot-password / reset flow. Planner uses explore_depth.
