# Student Exam Permission ERP (Node.js)

A complete, production-ready University ERP for managing student exam permissions, dues clearance, and automated temporary admit card generation with QR code verification.

---

## 🌟 Key Features & Workflow Architecture

The ERP manages four key user roles with strict institutional boundaries:

```
[Super Admin] ──> Appoints Committee Members & Appoints CRs for Sections (e.g. 10/A)
                        │
                        ▼
             [Class Representative (CR)]
                        │ (Whitelists Student ID & Gmail Address)
                        ▼
                    [Student] ──> Logs in via Google Authentication
                        │
                        ├─► Selects Exam Term (e.g. Mid Term Fall 2026)
                        ├─► Selects Course & Exam Slot (Date/Time)
                        └─► MUST Declare Current Due Amount (Mandatory)
                                │
                                ▼
               [Permission Granting Committee]
                                │ (Reviews Dues & Course Details)
                                ▼
                           [ APPROVED ]
                                │
                                ▼
               [Auto-Generated Temporary Admit Card]
                                │
                                ├─► Printable with Official Seal & Signatures
                                └─► Encrypted QR Code for Proctor Verification
```

### 1. The 4 Main Roles

1. **Super Admin**:
   - Creates academic sections (e.g., 10th Semester Section A $\rightarrow$ `10/A`).
   - Appoints and manages the **Permission Granting Committee**.
   - Designates **Class Representatives (CR / Admin)** for specific sections.
   - Publishes and activates Exam Terms (e.g., *Mid Term Fall 2026*).

2. **Admin (Class Representative / CR)**:
   - Manages their specific section (e.g., `10/A`).
   - Has the authority to whitelist students by entering their **Student ID** and **Gmail address**.
   - Supports single entry and bulk CSV imports.

3. **Student**:
   - Signs in strictly via **Google Authentication** using the Gmail address whitelisted by their CR.
   - Unwhitelisted Gmails are blocked with `403 Access Denied`.
   - Views active exam terms and available courses.
   - **Mandatory Dues Requirement**: Must report their outstanding tuition due amount before submitting.
   - Views request history and tracks real-time review status.
   - Upon approval, accesses and prints their official **Temporary Admit Card**.

4. **Permission Granting Committee**:
   - Assigned by the Super Admin.
   - Filters applications by Section (`10/A`), Exam Term, Status, and Search query.
   - Evaluates student declared dues against university exam clearance policies.
   - **Approve**: Automatically generates a unique admit card token and high-resolution QR verification code.
   - **Reject**: Submits mandatory rejection remarks explaining clearance issues.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18, v20, v22, or v26+)
- npm (v9+)

### Installation

```bash
# Clone or navigate into the directory
cd Permission

# Install dependencies
npm install

# Start the ERP server
npm start
```

Open your browser at: **`http://localhost:3000`**

---

## 🔑 Pre-Configured Test Credentials

For quick evaluation, click any card in the **"Instant Evaluator Fast-Switch"** on the login page:

| Role | Email | Password / Auth Mode | Pre-assigned Scope |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@university.edu` | `admin123` | Full Institutional Control |
| **Permission Committee** | `committee@university.edu` | `committee123` | All Sections Review Desk |
| **Class Rep (CR)** | `cr.10a@university.edu` | `cr123` | Admin for Section `10/A` |
| **Whitelisted Student 1** | `student.rakib@gmail.com` | Google Auth | ID: `2022-1-60-001`, Sec: `10/A` |
| **Whitelisted Student 2** | `student.sarah@gmail.com` | Google Auth | ID: `2022-1-60-002`, Sec: `10/A` |

---

## 🧪 Automated End-to-End Test

To run the complete automated test covering all 8 steps of the workflow:

```bash
node test-e2e.js
```

**Test Steps Covered:**
1. ✅ Rejection of unwhitelisted Gmail addresses (403).
2. ✅ CR whitelisting of new student (`2022-1-60-099`).
3. ✅ Google authentication for newly whitelisted student.
4. ✅ Validation failure if due amount is omitted (400).
5. ✅ Successful submission with declared dues (12,500 BDT).
6. ✅ Committee adjudication and approval.
7. ✅ Auto-generation of Temporary Admit Card with QR code.
8. ✅ Public verification of QR code by invigilator scan.

---

## 📁 Project Structure

```
Permission/
├── server.js               # Main Express application & static server
├── package.json
├── .env                    # Environment variables (PORT, JWT_SECRET, GOOGLE_CLIENT_ID)
├── erp.db                  # Synchronous ACID SQLite database
├── test-e2e.js             # Automated end-to-end test runner
├── src/
│   ├── config/
│   │   └── database.js     # Schema migrations and initial seeding (node:sqlite)
│   ├── middleware/
│   │   └── auth.js         # JWT verification & RBAC role guards
│   ├── controllers/
│   │   ├── authController.js       # Google OAuth & credential authentication
│   │   ├── crController.js         # Section 10/A student whitelisting
│   │   ├── studentController.js    # Dues declaration & permission requests
│   │   ├── committeeController.js  # Committee approval & admit card triggering
│   │   └── superAdminController.js # Governance, CR assignment & QR verify
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── crRoutes.js
│   │   ├── studentRoutes.js
│   │   ├── committeeRoutes.js
│   │   └── superAdminRoutes.js
│   └── utils/
│       └── qrGenerator.js  # High-resolution QR code generator
└── public/
    ├── index.html          # Unified login portal & Google Auth simulation
    ├── student.html        # Student desk (Date/time, Course, Dues, Admit card)
    ├── cr.html             # Class Representative whitelist portal (Section 10/A)
    ├── committee.html      # Permission Committee review queue
    ├── superadmin.html     # Super Admin management console
    ├── admit-card.html     # Official printable Temporary Admit Card
    ├── verify.html         # Public QR verification desk for proctors
    ├── css/styles.css      # Print rules and modern styling
    └── js/app.js           # Client-side API and session management
```

---

## 🖨️ Printing the Temporary Admit Card

1. Student logs into `/student.html`.
2. Once the committee approves the request, the status badge updates to **APPROVED** and displays a **"Print Admit Card"** button.
3. Clicking opens `/admit-card.html?requestId=<id>`.
4. Pressing **"Print Temporary Admit Card"** or `Ctrl + P` renders an official certificate layout with:
   - University seal and official header.
   - Watermark background: *"TEMPORARY ADMIT"*.
   - Student ID, Name, Section (`10/A`), Course, and Exam Time.
   - Financial clearance status.
   - High-resolution QR code linked to `/verify.html?token=<uuid>`.
   - Authorized signatures (CR, Committee Convenor, Controller of Exams).
