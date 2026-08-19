#!/bin/bash
set -e
BASE=http://localhost:8787/api
F=/tmp/demo_founder.txt
A=/tmp/demo_ananya.txt
R=/tmp/demo_rohan.txt
M=/tmp/demo_meera.txt

jget() { python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }

echo "== login founder =="
curl -s -c $F -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"snehk.sockscarving@gmail.com","password":"Founder@12345"}' >/dev/null

echo "== company settings =="
curl -s -b $F -X PUT $BASE/payroll/company-settings -H 'Content-Type: application/json' \
  -d '{"name":"Acme Retail Pvt Ltd","addressLine1":"221 Business Park Road","addressLine2":"Bengaluru, Karnataka - 560001","panNumber":"AACPA1234A"}' >/dev/null

echo "== create employees =="
ANANYA_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' \
  -d '{"employeeCode":"EMP-101","fullName":"Ananya Sharma","email":"ananya@demo.local","employeeType":"office_laptop","department":"Human Resources","designation":"HR Manager","dateOfJoining":"2025-03-01"}' | jget id)
ROHAN_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' \
  -d '{"employeeCode":"EMP-102","fullName":"Rohan Verma","email":"rohan@demo.local","employeeType":"office_laptop","department":"Engineering","designation":"Engineering Manager","dateOfJoining":"2024-11-15"}' | jget id)
MEERA_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' \
  -d '{"employeeCode":"EMP-103","fullName":"Meera Iyer","email":"meera@demo.local","employeeType":"wfh","department":"Engineering","designation":"Software Engineer","dateOfJoining":"2025-06-10"}' | jget id)
echo "Ananya=$ANANYA_ID Rohan=$ROHAN_ID Meera=$MEERA_ID"

curl -s -b $F -X PUT $BASE/employees/$ROHAN_ID -H 'Content-Type: application/json' -d '{"reportingManagerId":1}' >/dev/null
curl -s -b $F -X PUT $BASE/employees/$ANANYA_ID -H 'Content-Type: application/json' -d '{"reportingManagerId":1}' >/dev/null
curl -s -b $F -X PUT $BASE/employees/$MEERA_ID -H 'Content-Type: application/json' -d "{\"reportingManagerId\":$ROHAN_ID}" >/dev/null

echo "== provision logins =="
curl -s -b $F -X POST $BASE/auth/provision -H 'Content-Type: application/json' \
  -d "{\"employeeId\":$ANANYA_ID,\"email\":\"ananya@demo.local\",\"password\":\"Demo@1234\",\"role\":\"hr\"}" >/dev/null
curl -s -b $F -X POST $BASE/auth/provision -H 'Content-Type: application/json' \
  -d "{\"employeeId\":$ROHAN_ID,\"email\":\"rohan@demo.local\",\"password\":\"Demo@1234\",\"role\":\"manager\"}" >/dev/null
curl -s -b $F -X POST $BASE/auth/provision -H 'Content-Type: application/json' \
  -d "{\"employeeId\":$MEERA_ID,\"email\":\"meera@demo.local\",\"password\":\"Demo@1234\",\"role\":\"employee\"}" >/dev/null

echo "== salary structures =="
curl -s -b $F -X POST $BASE/payroll/salary-structures -H 'Content-Type: application/json' \
  -d '{"employeeId":1,"basic":60000,"hra":24000,"effectiveFrom":"2025-01-01","components":[{"name":"Other Allowance","type":"earning","amount":16000}]}' >/dev/null
curl -s -b $F -X POST $BASE/payroll/salary-structures -H 'Content-Type: application/json' \
  -d "{\"employeeId\":$ANANYA_ID,\"basic\":35000,\"hra\":14000,\"effectiveFrom\":\"2025-03-01\",\"components\":[{\"name\":\"Other Allowance\",\"type\":\"earning\",\"amount\":6000}]}" >/dev/null
curl -s -b $F -X POST $BASE/payroll/salary-structures -H 'Content-Type: application/json' \
  -d "{\"employeeId\":$ROHAN_ID,\"basic\":45000,\"hra\":18000,\"effectiveFrom\":\"2024-11-15\",\"components\":[{\"name\":\"Other Allowance\",\"type\":\"earning\",\"amount\":12000}]}" >/dev/null
curl -s -b $F -X POST $BASE/payroll/salary-structures -H 'Content-Type: application/json' \
  -d "{\"employeeId\":$MEERA_ID,\"basic\":28000,\"hra\":11000,\"effectiveFrom\":\"2025-06-10\",\"components\":[{\"name\":\"Other Allowance\",\"type\":\"earning\",\"amount\":6000}]}" >/dev/null

echo "== bank + payroll details =="
for pair in "1:Founder Admin:1234500001:HDFC0001234:HDFC Bank:AAAPF1111A:UAN100000001" \
            "$ANANYA_ID:Ananya Sharma:1234500002:ICIC0005678:ICICI Bank:AAAPA2222B:UAN100000002" \
            "$ROHAN_ID:Rohan Verma:1234500003:SBIN0009876:State Bank of India:AAAPR3333C:UAN100000003" \
            "$MEERA_ID:Meera Iyer:1234500004:HDFC0001234:HDFC Bank:AAAPM4444D:UAN100000004"; do
  IFS=: read -r id name acct ifsc bank pan uan <<< "$pair"
  curl -s -b $F -X PUT $BASE/payroll/bank-details/$id -H 'Content-Type: application/json' \
    -d "{\"accountHolderName\":\"$name\",\"accountNumber\":\"$acct\",\"ifsc\":\"$ifsc\",\"bankName\":\"$bank\"}" >/dev/null
  curl -s -b $F -X PUT $BASE/payroll/employee-payroll-details/$id -H 'Content-Type: application/json' \
    -d "{\"panNumber\":\"$pan\",\"uanNumber\":\"$uan\",\"taxRegime\":\"New Regime\"}" >/dev/null
done

echo "== holidays =="
curl -s -b $F -X POST $BASE/payroll/holidays -H 'Content-Type: application/json' -d '{"date":"2026-08-15","name":"Independence Day"}' >/dev/null

echo "== biometric device + import =="
curl -s -b $F -X POST $BASE/biometric/devices -H 'Content-Type: application/json' -d '{"deviceCode":"MAIN-GATE","location":"Head Office Main Gate"}' >/dev/null
BATCH_ID=$(curl -s -b $F -X POST $BASE/biometric/import/preview -F "deviceCode=MAIN-GATE" -F "file=@/tmp/demo-biometric.xlsx" | jget batchId)
echo "batchId=$BATCH_ID"
curl -s -b $F -X POST $BASE/biometric/import/$BATCH_ID/confirm

echo ""
echo "== live punches today (deliberately low-confidence, for the Exceptions demo) =="
curl -s -c $A -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"email":"ananya@demo.local","password":"Demo@1234"}' >/dev/null
curl -s -c $R -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"email":"rohan@demo.local","password":"Demo@1234"}' >/dev/null
curl -s -c $M -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"email":"meera@demo.local","password":"Demo@1234"}' >/dev/null

curl -s -b $A -X POST $BASE/attendance/punch -H 'Content-Type: application/json' -d '{"type":"in"}' >/dev/null
curl -s -b $A -X POST $BASE/attendance/punch -H 'Content-Type: application/json' -d '{"type":"out"}' >/dev/null
curl -s -b $R -X POST $BASE/attendance/punch -H 'Content-Type: application/json' -d '{"type":"in"}' >/dev/null
curl -s -b $R -X POST $BASE/attendance/punch -H 'Content-Type: application/json' -d '{"type":"out"}' >/dev/null
curl -s -b $M -X POST $BASE/attendance/punch -H 'Content-Type: application/json' -d '{"type":"in","latitude":12.9716,"longitude":77.5946}' >/dev/null

echo "== HR (Ananya) approves her own exception via founder override, leave others pending for the demo =="
curl -s -b $F http://localhost:8787/api/attendance/exceptions | python3 -c "
import json,sys
rows = json.load(sys.stdin)
for r in rows:
    print(r['id'], r['employeeId'], r['status'])
"

echo "== assets =="
LAPTOP_ID=$(curl -s -b $F -X POST $BASE/assets -H 'Content-Type: application/json' -d '{"assetCode":"LAP-101","name":"MacBook Pro 14\"","category":"Laptop"}' | jget id)
MONITOR_ID=$(curl -s -b $F -X POST $BASE/assets -H 'Content-Type: application/json' -d '{"assetCode":"MON-101","name":"Dell 27\" Monitor","category":"Peripheral"}' | jget id)
curl -s -b $F -X POST $BASE/assets -H 'Content-Type: application/json' -d '{"assetCode":"PHN-101","name":"iPhone 13","category":"Phone"}' >/dev/null
curl -s -b $F -X POST $BASE/assets/$LAPTOP_ID/assign -H 'Content-Type: application/json' -d "{\"employeeId\":$ROHAN_ID}" >/dev/null
curl -s -b $F -X POST $BASE/assets/$MONITOR_ID/assign -H 'Content-Type: application/json' -d "{\"employeeId\":$MEERA_ID}" >/dev/null

echo "== policies =="
curl -s -b $F -X POST $BASE/policies -H 'Content-Type: application/json' \
  -d '{"title":"Leave Policy","category":"HR","content":"Casual Leave: 12 days/year. Sick Leave: 8 days/year. Earned Leave: 15 days/year, accrued monthly. Unused Earned Leave carries forward up to 45 days."}' >/dev/null
curl -s -b $F -X POST $BASE/policies -H 'Content-Type: application/json' \
  -d '{"title":"Code of Conduct","category":"General","content":"All employees are expected to act with integrity, respect colleagues, and safeguard company and customer data. Violations should be reported to HR."}' >/dev/null

echo "== queries =="
curl -s -b $M -X POST $BASE/queries -H 'Content-Type: application/json' -d '{"category":"IT","subject":"Laptop charger not working","description":"The charger stopped working since yesterday."}' >/dev/null
QUERY2_ID=$(curl -s -b $R -X POST $BASE/queries -H 'Content-Type: application/json' -d '{"category":"Facilities","subject":"AC not cooling in cabin 3","description":"Room temperature is uncomfortably high."}' | jget id)
curl -s -b $A -X PUT $BASE/queries/$QUERY2_ID -H 'Content-Type: application/json' -d '{"status":"resolved"}' >/dev/null

echo "== KRA =="
CYCLE_ID=$(curl -s -b $F -X POST $BASE/kra/cycles -H 'Content-Type: application/json' -d '{"name":"H2 2026","startDate":"2026-07-01","endDate":"2026-12-31"}' | jget id)
GOAL1_ID=$(curl -s -b $R -X POST $BASE/kra/goals -H 'Content-Type: application/json' -d "{\"employeeId\":$MEERA_ID,\"cycleId\":$CYCLE_ID,\"title\":\"Ship user onboarding redesign\",\"weightPct\":60}" | jget id)
curl -s -b $F -X POST $BASE/kra/goals -H 'Content-Type: application/json' -d "{\"employeeId\":$ROHAN_ID,\"cycleId\":$CYCLE_ID,\"title\":\"Reduce sprint carryover by 20%\",\"weightPct\":50}" >/dev/null
curl -s -b $M -X PUT $BASE/kra/goals/$GOAL1_ID/self-rating -H 'Content-Type: application/json' -d '{"rating":4,"comments":"Shipped on time, positive early feedback."}' >/dev/null
curl -s -b $R -X PUT $BASE/kra/goals/$GOAL1_ID/manager-rating -H 'Content-Type: application/json' -d '{"rating":4.5,"comments":"Great execution, exceeded expectations on polish."}' >/dev/null

echo "== leave requests =="
curl -s -b $M -X POST $BASE/leave/requests -H 'Content-Type: application/json' -d '{"leaveTypeId":1,"startDate":"2026-08-24","endDate":"2026-08-25","reason":"Personal work"}' >/dev/null
curl -s -b $R -X POST $BASE/leave/requests -H 'Content-Type: application/json' -d '{"leaveTypeId":2,"startDate":"2026-08-21","endDate":"2026-08-21","reason":"Not feeling well"}' >/dev/null
EL_REQ_ID=$(curl -s -b $A -X POST $BASE/leave/requests -H 'Content-Type: application/json' -d '{"leaveTypeId":3,"startDate":"2026-07-20","endDate":"2026-07-22","reason":"Family function"}' | jget id)
curl -s -b $F -X PUT $BASE/leave/requests/$EL_REQ_ID/decision -H 'Content-Type: application/json' -d '{"decision":"approved"}' >/dev/null

echo "== leave balances (no API endpoint exists for this yet — direct seed) =="
for emp_year in "1:2026" "$ANANYA_ID:2026" "$ROHAN_ID:2026" "$MEERA_ID:2026"; do
  IFS=: read -r id year <<< "$emp_year"
  npx wrangler d1 execute hrms-db --local --command "INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated, used) VALUES ($id, 1, $year, 12, 0), ($id, 2, $year, 8, 0), ($id, 3, $year, 15, 3);" >/dev/null 2>&1
done

echo "== exit request (Meera — resignation filed, IT clearance started, not settled) =="
EXIT_ID=$(curl -s -b $M -X POST $BASE/exit/requests -H 'Content-Type: application/json' -d '{"resignationDate":"2026-08-19","lastWorkingDay":"2026-09-18","reason":"Relocating to another city"}' | jget id)
curl -s -b $A -X POST $BASE/exit/requests/$EXIT_ID/clearances -H 'Content-Type: application/json' -d '{"department":"IT"}' >/dev/null

echo "== payroll run (current month, previewed — left unlocked with pending exceptions to work through) =="
RUN_ID=$(curl -s -b $F -X POST $BASE/payroll/runs -H 'Content-Type: application/json' -d '{"month":8,"year":2026}' | jget id)
curl -s -b $F -X POST $BASE/payroll/runs/$RUN_ID/preview -H 'Content-Type: application/json' -d '{}'
echo ""
curl -s -b $R -X PUT $BASE/payroll/runs/$RUN_ID/manual-entries/$MEERA_ID -H 'Content-Type: application/json' -d '{"loan":1500,"tds":0}' >/dev/null

echo ""
echo "DONE. IDs: founder=1 ananya=$ANANYA_ID rohan=$ROHAN_ID meera=$MEERA_ID run=$RUN_ID exit=$EXIT_ID"
