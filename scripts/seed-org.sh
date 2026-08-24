#!/bin/bash
set -e
BASE=http://localhost:8787/api
F=/tmp/demo_founder.txt

jget() { python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }

echo "== login founder =="
curl -s -c $F -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"snehk.sockscarving@gmail.com","password":"Founder@12345"}' >/dev/null

echo "== create employees =="
# Management
CEO_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-001","fullName":"Viren Zalavadiya","email":"viren@demo.local","employeeType":"office_laptop","department":"Management","designation":"CEO","dateOfJoining":"2023-01-01"}' | jget id)
CMO_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-002","fullName":"Yaxit Mandviya","email":"yaxit@demo.local","employeeType":"office_laptop","department":"Management","designation":"CMO","dateOfJoining":"2023-01-01"}' | jget id)
CDO_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-003","fullName":"Yash Sakhadiya","email":"yash@demo.local","employeeType":"office_laptop","department":"Management","designation":"CDO","dateOfJoining":"2023-01-01"}' | jget id)

# HR
HR_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-004","fullName":"Kashish Varma","email":"kashish@demo.local","employeeType":"office_laptop","department":"HR","designation":"HR Executive","dateOfJoining":"2023-01-01"}' | jget id)

# Social Media
SM_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-005","fullName":"Roopali Sikarwar","email":"roopali@demo.local","employeeType":"office_laptop","department":"Social Media","designation":"Social Media Executive","dateOfJoining":"2023-01-01"}' | jget id)

# Influencer Marketing
IM_M_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-006","fullName":"Disha Jain","email":"disha@demo.local","employeeType":"office_laptop","department":"Influencer Marketing","designation":"Influencer Marketing Manager","dateOfJoining":"2023-01-01"}' | jget id)
IM_E1_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-007","fullName":"Raghav Soni","email":"raghav@demo.local","employeeType":"office_laptop","department":"Influencer Marketing","designation":"Influencer Marketing Executive","dateOfJoining":"2023-01-01"}' | jget id)
IM_E2_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-008","fullName":"Gunjaa Barai","email":"gunjaa@demo.local","employeeType":"office_laptop","department":"Influencer Marketing","designation":"Influencer Marketing Executive","dateOfJoining":"2023-01-01"}' | jget id)

# Customer Support
CS_A_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-009","fullName":"Akhil Pillai","email":"akhil@demo.local","employeeType":"office_laptop","department":"Customer Support","designation":"Astt. CSM","dateOfJoining":"2023-01-01"}' | jget id)
CS_E1_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-010","fullName":"Bibha Bharati","email":"bibha@demo.local","employeeType":"office_laptop","department":"Customer Support","designation":"CSE","dateOfJoining":"2023-01-01"}' | jget id)
CS_E2_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-011","fullName":"Tulsi Maru","email":"tulsi@demo.local","employeeType":"office_laptop","department":"Customer Support","designation":"CSE","dateOfJoining":"2023-01-01"}' | jget id)

# Fashion Designer
FD_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-012","fullName":"Shrinkhla Sonkar","email":"shrinkhla@demo.local","employeeType":"office_laptop","department":"Fashion Designer","designation":"Fashion Designer","dateOfJoining":"2023-01-01"}' | jget id)

# Graphic Designer
GD_1_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-013","fullName":"Zaid Mohammed","email":"zaid@demo.local","employeeType":"office_laptop","department":"Graphic Designer","designation":"Graphic Designer","dateOfJoining":"2023-01-01"}' | jget id)
GD_2_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-014","fullName":"Anushka Dubey","email":"anushka@demo.local","employeeType":"office_laptop","department":"Graphic Designer","designation":"Graphic Designer","dateOfJoining":"2023-01-01"}' | jget id)

# Finance
FIN_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-015","fullName":"Ketki Kakadiya","email":"ketki@demo.local","employeeType":"office_laptop","department":"Finance","designation":"Accountant","dateOfJoining":"2023-01-01"}' | jget id)

# Warehouse Manager
WH_M_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-016","fullName":"Meet Suthariya","email":"meet@demo.local","employeeType":"office_laptop","department":"Warehouse","designation":"Packing Manager","dateOfJoining":"2023-01-01"}' | jget id)

# Warehouse Packing Executives & Pickers
code=17
declare -a WH_EXECS=("Vikas Gosai" "Shailesh Desai" "Manoj baroliya" "Jayendra Makwana" "Rahul Solanki" "Nitin Raval" "Raju Kaka" "Nituben" "Madhuben" "jyotiben" "Kaminiben")
for name in "${WH_EXECS[@]}"; do
  ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d "{\"employeeCode\":\"ORG-0${code}\",\"fullName\":\"${name}\",\"email\":\"${name// /.}@demo.local\",\"employeeType\":\"office_laptop\",\"department\":\"Warehouse\",\"designation\":\"packing executive\",\"dateOfJoining\":\"2023-01-01\"}" | jget id)
  curl -s -b $F -X PUT $BASE/employees/$ID -H 'Content-Type: application/json' -d "{\"reportingManagerId\":$WH_M_ID}" >/dev/null
  code=$((code+1))
done

declare -a WH_PICKERS=("Abhisbhek" "Aush" "Jaypal")
for name in "${WH_PICKERS[@]}"; do
  ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d "{\"employeeCode\":\"ORG-0${code}\",\"fullName\":\"${name}\",\"email\":\"${name// /.}@demo.local\",\"employeeType\":\"office_laptop\",\"department\":\"Warehouse\",\"designation\":\"Picker\",\"dateOfJoining\":\"2023-01-01\"}" | jget id)
  curl -s -b $F -X PUT $BASE/employees/$ID -H 'Content-Type: application/json' -d "{\"reportingManagerId\":$WH_M_ID}" >/dev/null
  code=$((code+1))
done

# Admin
AD_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-031","fullName":"Tejal Vaghela","email":"tejal@demo.local","employeeType":"office_laptop","department":"Admin","designation":"Office Girl","dateOfJoining":"2023-01-01"}' | jget id)

# Freelancer
FL_1_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-032","fullName":"Nagendra","email":"nagendra@demo.local","employeeType":"office_laptop","department":"Freelancer","designation":"Retention Expert","dateOfJoining":"2023-01-01"}' | jget id)
FL_2_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-033","fullName":"Sneh Kansagra","email":"sneh@demo.local","employeeType":"office_laptop","department":"Freelancer","designation":"Data analyst Intern","dateOfJoining":"2023-01-01"}' | jget id)

# IT
IT_1_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-034","fullName":"Akshat Dubey","email":"akshat@demo.local","employeeType":"office_laptop","department":"IT","designation":"Product Management and Management Intern","dateOfJoining":"2023-01-01"}' | jget id)
IT_2_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-035","fullName":"Bharat B","email":"bharat@demo.local","employeeType":"office_laptop","department":"IT","designation":"Software Development Intern","dateOfJoining":"2023-01-01"}' | jget id)
IT_3_ID=$(curl -s -b $F -X POST $BASE/employees -H 'Content-Type: application/json' -d '{"employeeCode":"ORG-036","fullName":"Samar Singla","email":"samar@demo.local","employeeType":"office_laptop","department":"IT","designation":"IT intern","dateOfJoining":"2023-01-01"}' | jget id)

echo "== Set managers =="
curl -s -b $F -X PUT $BASE/employees/$CMO_ID -H 'Content-Type: application/json' -d "{\"reportingManagerId\":$CEO_ID}" >/dev/null
curl -s -b $F -X PUT $BASE/employees/$CDO_ID -H 'Content-Type: application/json' -d "{\"reportingManagerId\":$CEO_ID}" >/dev/null
curl -s -b $F -X PUT $BASE/employees/$HR_ID -H 'Content-Type: application/json' -d "{\"reportingManagerId\":$CEO_ID}" >/dev/null
curl -s -b $F -X PUT $BASE/employees/$IM_M_ID -H 'Content-Type: application/json' -d "{\"reportingManagerId\":$CMO_ID}" >/dev/null
curl -s -b $F -X PUT $BASE/employees/$IM_E1_ID -H 'Content-Type: application/json' -d "{\"reportingManagerId\":$IM_M_ID}" >/dev/null
curl -s -b $F -X PUT $BASE/employees/$IM_E2_ID -H 'Content-Type: application/json' -d "{\"reportingManagerId\":$IM_M_ID}" >/dev/null

echo "== Add KRAs for Influencer Marketing =="
CYCLE_ID=$(curl -s -b $F -X POST $BASE/kra/cycles -H 'Content-Type: application/json' -d '{"name":"Q3 Influencer Campaign","startDate":"2026-07-01","endDate":"2026-09-30"}' | jget id)

curl -s -b $F -X POST $BASE/kra/goals -H 'Content-Type: application/json' -d "{\"employeeId\":$IM_M_ID,\"cycleId\":$CYCLE_ID,\"title\":\"Onboard 50 new influencers for the Q3 campaign\",\"weightPct\":40}" >/dev/null
curl -s -b $F -X POST $BASE/kra/goals -H 'Content-Type: application/json' -d "{\"employeeId\":$IM_M_ID,\"cycleId\":$CYCLE_ID,\"title\":\"Achieve a 1.5x ROI on the total influencer budget\",\"weightPct\":60}" >/dev/null
curl -s -b $F -X POST $BASE/kra/goals -H 'Content-Type: application/json' -d "{\"employeeId\":$IM_E1_ID,\"cycleId\":$CYCLE_ID,\"title\":\"Contact and screen 100 potential micro-influencers per week\",\"weightPct\":50}" >/dev/null
curl -s -b $F -X POST $BASE/kra/goals -H 'Content-Type: application/json' -d "{\"employeeId\":$IM_E1_ID,\"cycleId\":$CYCLE_ID,\"title\":\"Track and report weekly engagement metrics for live campaigns\",\"weightPct\":50}" >/dev/null
curl -s -b $F -X POST $BASE/kra/goals -H 'Content-Type: application/json' -d "{\"employeeId\":$IM_E2_ID,\"cycleId\":$CYCLE_ID,\"title\":\"Contact and screen 100 potential micro-influencers per week\",\"weightPct\":50}" >/dev/null
curl -s -b $F -X POST $BASE/kra/goals -H 'Content-Type: application/json' -d "{\"employeeId\":$IM_E2_ID,\"cycleId\":$CYCLE_ID,\"title\":\"Track and report weekly engagement metrics for live campaigns\",\"weightPct\":50}" >/dev/null

echo "Done"
