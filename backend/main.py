from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from pydantic import BaseModel, Field, EmailStr
import bcrypt
from datetime import datetime, timedelta
from typing import List, Optional
import enum
import re
import uvicorn

# ==================== PASSWORD HASHING ====================
def hash_password(password: str) -> str:
    pw_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8"))
    except Exception:
        return False

# ==================== DATABASE SETUP ====================
SQLALCHEMY_DATABASE_URL = "sqlite:///./titukulane.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ==================== ENUMS ====================
class MemberRole(str, enum.Enum):
    ADMIN = "admin"
    TREASURER = "treasurer"
    MEMBER = "member"

class TransactionType(str, enum.Enum):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    INTEREST = "interest"
    LOAN_REPAYMENT = "loan_repayment"
    LOAN_DISBURSEMENT = "loan_disbursement"
    SHARE_CONTRIBUTION = "share_contribution"

class PaymentMethod(str, enum.Enum):
    TNM_MPAMBA = "tnm_mpamba"
    AIRTEL_MONEY = "airtel_money"
    NATIONAL_BANK = "national_bank"
    CASH = "cash"

class LoanStatus(str, enum.Enum):
    ACTIVE = "active"
    PAID_OFF = "paid_off"
    DEFAULTED = "defaulted"
    PENDING = "pending"

class LoanPurpose(str, enum.Enum):
    FARM_EQUIPMENT = "farm_equipment"
    BUSINESS = "business"
    SCHOOL_FEES = "school_fees"
    MEDICAL = "medical"
    HOME_IMPROVEMENT = "home_improvement"
    OTHER = "other"

class Mood(str, enum.Enum):
    GREAT = "🎉 Great"
    GOOD = "😊 Good"
    OKAY = "😐 Okay"
    BAD = "😞 Bad"

class NotificationType(str, enum.Enum):
    DEPOSIT = "deposit"
    INTEREST = "interest"
    CREDIT_SCORE = "credit_score"
    LOAN_DUE = "loan_due"
    LOAN_APPROVED = "loan_approved"
    GROUP_INVITE = "group_invite"
    GENERAL = "general"

# ==================== MODELS ====================
class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    interest_rate = Column(Float, default=5.0)
    share_value = Column(Float, default=100.0)
    cycle_duration_months = Column(Integer, default=12)
    created_at = Column(DateTime, default=datetime.utcnow)

    members = relationship("Member", back_populates="group", cascade="all, delete-orphan", foreign_keys="Member.group_id")
    transactions = relationship("Transaction", back_populates="group", cascade="all, delete-orphan")
    loans = relationship("Loan", back_populates="group", cascade="all, delete-orphan", foreign_keys="Loan.group_id")
    notes = relationship("DailyNote", back_populates="group", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="group", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="group", cascade="all, delete-orphan")

class Member(Base):
    __tablename__ = "members"
    __table_args__ = (
        UniqueConstraint("group_id", "identifier", name="uq_member_identifier_per_group"),
    )

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(String, unique=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"))
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    identifier = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)
    role = Column(Enum(MemberRole), default=MemberRole.MEMBER)
    joined_at = Column(DateTime, default=datetime.utcnow)
    savings_balance = Column(Float, default=0.0)
    credit_score = Column(Integer, default=700)
    total_shares = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    group = relationship("Group", back_populates="members", foreign_keys=[group_id])
    transactions = relationship("Transaction", back_populates="member", cascade="all, delete-orphan", foreign_keys="Transaction.member_id")
    loans = relationship("Loan", back_populates="member", cascade="all, delete-orphan", foreign_keys="Loan.member_id")
    approved_loans = relationship("Loan", back_populates="approver", foreign_keys="Loan.approved_by")
    notes = relationship("DailyNote", back_populates="member", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="member", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="member", cascade="all, delete-orphan")
    savings_goal = relationship("SavingsGoal", back_populates="member", uselist=False, cascade="all, delete-orphan")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"))
    member_id = Column(Integer, ForeignKey("members.id"))
    type = Column(Enum(TransactionType))
    amount = Column(Float)
    currency = Column(String, default="USD")
    method = Column(Enum(PaymentMethod), nullable=True)
    description = Column(String, nullable=True)
    reference = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("Group", back_populates="transactions")
    member = relationship("Member", back_populates="transactions", foreign_keys=[member_id])

class Loan(Base):
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"))
    member_id = Column(Integer, ForeignKey("members.id"))
    loan_number = Column(String, unique=True, index=True)
    title = Column(String)
    purpose = Column(Enum(LoanPurpose))
    principal = Column(Float)
    interest_rate = Column(Float, default=10.0)
    total_paid = Column(Float, default=0.0)
    status = Column(Enum(LoanStatus), default=LoanStatus.PENDING)
    duration_months = Column(Integer, default=12)
    monthly_payment = Column(Float, default=0.0)
    paid_off_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime, nullable=True)
    approved_by = Column(Integer, ForeignKey("members.id"), nullable=True)

    group = relationship("Group", back_populates="loans", foreign_keys=[group_id])
    member = relationship("Member", back_populates="loans", foreign_keys=[member_id])
    approver = relationship("Member", back_populates="approved_loans", foreign_keys=[approved_by])

class SavingsGoal(Base):
    __tablename__ = "savings_goals"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"), unique=True)
    name = Column(String, default="New Farm Equipment")
    target_amount = Column(Float, default=6000.0)
    current_amount = Column(Float, default=0.0)
    icon = Column(String, default="🚜")

    member = relationship("Member", back_populates="savings_goal")

class DailyNote(Base):
    __tablename__ = "daily_notes"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"))
    member_id = Column(Integer, ForeignKey("members.id"))
    note_date = Column(DateTime, default=datetime.utcnow)
    text = Column(Text)
    mood = Column(Enum(Mood), default=Mood.GOOD)

    group = relationship("Group", back_populates="notes")
    member = relationship("Member", back_populates="notes")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"))
    member_id = Column(Integer, ForeignKey("members.id"))
    type = Column(Enum(NotificationType))
    title = Column(String)
    description = Column(String)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("Group", back_populates="notifications")
    member = relationship("Member", back_populates="notifications")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"))
    member_id = Column(Integer, ForeignKey("members.id"))
    sender = Column(String, default="member")
    text = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)

    group = relationship("Group", back_populates="messages")
    member = relationship("Member", back_populates="messages")

Base.metadata.create_all(bind=engine)

# ==================== PYDANTIC SCHEMAS ====================
class GroupBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    interest_rate: float = Field(default=5.0, ge=1.0, le=100.0)
    share_value: float = Field(default=100.0, gt=0)
    cycle_duration_months: int = Field(default=12, ge=1, le=60)

class GroupCreate(GroupBase):
    pass

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    interest_rate: Optional[float] = None
    share_value: Optional[float] = None
    cycle_duration_months: Optional[int] = None

class GroupResponse(GroupBase):
    id: int
    group_id: str
    created_at: datetime
    member_count: int = 0
    total_savings: float = 0.0

    class Config:
        from_attributes = True

class MemberBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    identifier: Optional[str] = None

class MemberCreate(MemberBase):
    password: Optional[str] = None
    role: MemberRole = MemberRole.MEMBER

class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    identifier: Optional[str] = None
    password: Optional[str] = None
    role: Optional[MemberRole] = None
    is_active: Optional[bool] = None

class MemberResponse(MemberBase):
    id: int
    member_id: str
    group_id: int
    role: MemberRole
    joined_at: datetime
    savings_balance: float = 0.0
    credit_score: int
    total_shares: int
    is_active: bool

    class Config:
        from_attributes = True

class MemberProfileResponse(MemberResponse):
    group_name: Optional[str] = None

    class Config:
        from_attributes = True

class GroupRegistrationRequest(BaseModel):
    group_name: str = Field(..., min_length=2, max_length=100)
    admin_name: str = Field(..., min_length=2, max_length=100)
    identifier: str = Field(..., min_length=3)
    interest_rate: float = Field(default=5.0, ge=1.0, le=100.0)
    password: str = Field(..., min_length=8)

class LoginRequest(BaseModel):
    full_name: str = Field(..., description="Member's full name")
    group_name: str = Field(..., description="Name of the savings group")
    password: str = Field(..., min_length=1)

class LoginResponse(BaseModel):
    success: bool
    member_id: int
    group_id: int
    group_name: str
    full_name: str
    role: MemberRole
    token: str

class TransactionBase(BaseModel):
    type: TransactionType
    amount: float = Field(gt=0)
    currency: str = "USD"
    method: Optional[PaymentMethod] = None
    description: Optional[str] = None
    reference: Optional[str] = None

class TransactionCreate(TransactionBase):
    pass

class TransactionResponse(TransactionBase):
    id: int
    group_id: int
    member_id: int
    created_at: datetime
    member_name: Optional[str] = None

    class Config:
        from_attributes = True

class LoanBase(BaseModel):
    title: str
    purpose: LoanPurpose
    principal: float = Field(gt=0)
    interest_rate: float = Field(default=10.0, ge=0)
    duration_months: int = Field(default=12, ge=1, le=60)

class LoanCreate(LoanBase):
    pass

class LoanResponse(LoanBase):
    id: int
    group_id: int
    member_id: int
    loan_number: str
    total_paid: float
    status: LoanStatus
    monthly_payment: float
    paid_off_at: Optional[datetime] = None
    created_at: datetime
    due_date: Optional[datetime] = None
    member_name: Optional[str] = None

    class Config:
        from_attributes = True

class SavingsGoalBase(BaseModel):
    name: str
    target_amount: float = Field(gt=0)
    current_amount: float = Field(ge=0)
    icon: str = "🚜"

class SavingsGoalCreate(SavingsGoalBase):
    pass

class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    icon: Optional[str] = None

class SavingsGoalResponse(SavingsGoalBase):
    id: int
    member_id: int
    progress_percent: float = 0.0

    class Config:
        from_attributes = True

class DailyNoteBase(BaseModel):
    text: str = Field(..., min_length=1)
    mood: Mood = Mood.GOOD

class DailyNoteCreate(DailyNoteBase):
    pass

class DailyNoteResponse(DailyNoteBase):
    id: int
    group_id: int
    member_id: int
    note_date: datetime
    member_name: Optional[str] = None

    class Config:
        from_attributes = True

class NotificationBase(BaseModel):
    type: NotificationType
    title: str
    description: str

class NotificationCreate(NotificationBase):
    pass

class NotificationResponse(NotificationBase):
    id: int
    group_id: int
    member_id: int
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class ChatMessageBase(BaseModel):
    sender: str = "member"
    text: str = Field(..., min_length=1)

class ChatMessageCreate(ChatMessageBase):
    pass

class ChatMessageResponse(ChatMessageBase):
    id: int
    group_id: int
    member_id: int
    created_at: datetime
    is_read: bool
    member_name: Optional[str] = None

    class Config:
        from_attributes = True

class DashboardResponse(BaseModel):
    member: MemberProfileResponse
    group: GroupResponse
    recent_transactions: List[TransactionResponse]
    active_loans: List[LoanResponse]
    savings_goal: Optional[SavingsGoalResponse]
    recent_notes: List[DailyNoteResponse]
    unread_notifications: int
    group_members: List[MemberResponse]

    class Config:
        from_attributes = True

class GroupSummaryResponse(BaseModel):
    group: GroupResponse
    total_members: int
    total_savings: float
    total_loans_active: int
    total_loans_paid: int
    total_shares: int
    recent_transactions: List[TransactionResponse]
    top_members: List[MemberResponse]

    class Config:
        from_attributes = True

# ==================== DEPENDENCIES ====================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def generate_group_id(db: Session) -> str:
    count = db.query(Group).count() + 1
    return f"GRP-{datetime.now().year}-{count:04d}"

def generate_member_id(db: Session, group_id: int) -> str:
    count = db.query(Member).filter(Member.group_id == group_id).count() + 1
    return f"M-{group_id}-{count:04d}"

def generate_loan_number(db: Session, group_id: int) -> str:
    count = db.query(Loan).filter(Loan.group_id == group_id).count() + 1
    return f"L-{group_id}-{datetime.now().year}-{count:04d}"

# ==================== FASTAPI APP ====================
app = FastAPI(
    title="Titukulane+ API",
    description="Village Savings & Loan Association Backend with Group Support",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== SEED DATA ====================
def seed_database(db: Session):
    if db.query(Group).first():
        return

    group = Group(
        group_id="GRP-2026-0001",
        name="Sunrise Savings Group",
        interest_rate=5.2,
        share_value=100.0,
        cycle_duration_months=12,
        created_at=datetime(2023, 3, 15)
    )
    db.add(group)
    db.flush()

    admin = Member(
        member_id="M-1-0001",
        group_id=group.id,
        full_name="John Doe",
        email="john.doe@example.com",
        phone="+265 712 345 678",
        identifier="john.doe@example.com",
        password_hash=hash_password("password123"),
        role=MemberRole.ADMIN,
        savings_balance=4250.00,
        credit_score=847,
        total_shares=42,
        joined_at=datetime(2023, 3, 15),
        is_active=True
    )
    db.add(admin)
    db.flush()

    member2 = Member(
        member_id="M-1-0002",
        group_id=group.id,
        full_name="Chimwemwe Banda",
        email="chimwemwe@example.com",
        phone="+265 991 234 567",
        identifier="chimwemwe@example.com",
        password_hash=hash_password("password123"),
        role=MemberRole.MEMBER,
        savings_balance=2100.00,
        credit_score=720,
        total_shares=21,
        joined_at=datetime(2023, 6, 10),
        is_active=True
    )
    db.add(member2)
    db.flush()

    goal = SavingsGoal(
        member_id=admin.id,
        name="New Farm Equipment",
        target_amount=6000.0,
        current_amount=4250.0,
        icon="🚜"
    )
    db.add(goal)

    transactions = [
        Transaction(group_id=group.id, member_id=admin.id, type=TransactionType.DEPOSIT, amount=150.00, currency="USD", method=PaymentMethod.TNM_MPAMBA, description="Mobile Money - TNM", created_at=datetime(2026, 7, 18)),
        Transaction(group_id=group.id, member_id=admin.id, type=TransactionType.DEPOSIT, amount=200.00, currency="USD", method=PaymentMethod.AIRTEL_MONEY, description="Mobile Money - Airtel", created_at=datetime(2026, 7, 1)),
        Transaction(group_id=group.id, member_id=admin.id, type=TransactionType.INTEREST, amount=18.20, currency="USD", description="Monthly interest payment", created_at=datetime(2026, 6, 30)),
        Transaction(group_id=group.id, member_id=admin.id, type=TransactionType.WITHDRAWAL, amount=100.00, currency="MWK", method=PaymentMethod.AIRTEL_MONEY, description="Mobile Money", created_at=datetime(2026, 6, 20)),
        Transaction(group_id=group.id, member_id=admin.id, type=TransactionType.DEPOSIT, amount=200.00, currency="MWK", method=PaymentMethod.AIRTEL_MONEY, description="Mobile Money", created_at=datetime(2026, 6, 15)),
        Transaction(group_id=group.id, member_id=admin.id, type=TransactionType.LOAN_REPAYMENT, amount=147.00, currency="USD", description="Loan #L-1-2024-0042", created_at=datetime(2026, 5, 28)),
        Transaction(group_id=group.id, member_id=admin.id, type=TransactionType.DEPOSIT, amount=250.00, currency="USD", method=PaymentMethod.TNM_MPAMBA, description="Mobile Money - TNM", created_at=datetime(2026, 5, 15)),
        Transaction(group_id=group.id, member_id=member2.id, type=TransactionType.DEPOSIT, amount=300.00, currency="USD", method=PaymentMethod.TNM_MPAMBA, description="Monthly contribution", created_at=datetime(2026, 7, 10)),
    ]
    db.add_all(transactions)

    loans = [
        Loan(group_id=group.id, member_id=admin.id, loan_number="L-1-2024-0042", title="Farm Equipment Loan", purpose=LoanPurpose.FARM_EQUIPMENT, principal=800.00, interest_rate=10.0, total_paid=880.00, status=LoanStatus.PAID_OFF, duration_months=12, monthly_payment=73.33, paid_off_at=datetime(2025, 3, 15), created_at=datetime(2024, 3, 15)),
        Loan(group_id=group.id, member_id=admin.id, loan_number="L-1-2024-0018", title="School Fees Loan", purpose=LoanPurpose.SCHOOL_FEES, principal=500.00, interest_rate=12.0, total_paid=520.00, status=LoanStatus.PAID_OFF, duration_months=6, monthly_payment=86.67, paid_off_at=datetime(2024, 11, 20), created_at=datetime(2024, 5, 20)),
        Loan(group_id=group.id, member_id=admin.id, loan_number="L-1-2024-0005", title="Business Startup", purpose=LoanPurpose.BUSINESS, principal=300.00, interest_rate=12.0, total_paid=309.00, status=LoanStatus.PAID_OFF, duration_months=6, monthly_payment=51.50, paid_off_at=datetime(2024, 6, 10), created_at=datetime(2024, 1, 10)),
        Loan(group_id=group.id, member_id=member2.id, loan_number="L-1-2024-0023", title="Medical Emergency", purpose=LoanPurpose.MEDICAL, principal=400.00, interest_rate=8.0, total_paid=200.00, status=LoanStatus.ACTIVE, duration_months=6, monthly_payment=72.00, due_date=datetime(2024, 12, 1), created_at=datetime(2024, 6, 1)),
    ]
    db.add_all(loans)

    notes = [
        DailyNote(group_id=group.id, member_id=admin.id, note_date=datetime(2026, 7, 18), text="Made my monthly deposit today. The mobile money integration is working smoothly now.", mood=Mood.GOOD),
        DailyNote(group_id=group.id, member_id=admin.id, note_date=datetime(2026, 7, 15), text="Attended the village bank meeting. We discussed new loan terms.", mood=Mood.GREAT),
    ]
    db.add_all(notes)

    notifications = [
        Notification(group_id=group.id, member_id=admin.id, type=NotificationType.DEPOSIT, title="Deposit Successful", description="$150.00 has been added to your savings", created_at=datetime.now() - timedelta(hours=2)),
    ]
    db.add_all(notifications)

    messages = [
        ChatMessage(group_id=group.id, member_id=admin.id, sender="admin", text="Hello! How can I help you today?", created_at=datetime.now() - timedelta(hours=3)),
    ]
    db.add_all(messages)

    db.commit()

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

# ==================== AUTH & GROUP REGISTRATION ====================

@app.post("/api/auth/register-group", response_model=GroupResponse)
def register_group(request: GroupRegistrationRequest, db: Session = Depends(get_db)):
    existing = db.query(Member).filter(Member.identifier == request.identifier).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email or phone number already registered")

    existing_group = db.query(Group).filter(Group.name.ilike(request.group_name.strip())).first()
    if existing_group:
        raise HTTPException(status_code=400, detail="A group with this name already exists")

    group = Group(
        group_id=generate_group_id(db),
        name=request.group_name,
        interest_rate=request.interest_rate,
        share_value=100.0,
        cycle_duration_months=12
    )
    db.add(group)
    db.flush()

    admin = Member(
        member_id=generate_member_id(db, group.id),
        group_id=group.id,
        full_name=request.admin_name,
        identifier=request.identifier,
        email=request.identifier if "@" in request.identifier else None,
        phone=request.identifier if "@" not in request.identifier else None,
        password_hash=hash_password(request.password),
        role=MemberRole.ADMIN,
        savings_balance=0.0,
        credit_score=700,
        joined_at=datetime.utcnow()
    )
    db.add(admin)
    db.commit()
    db.refresh(group)

    return group

@app.post("/api/auth/login", response_model=LoginResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.name.ilike(request.group_name.strip())).first()
    if not group:
        raise HTTPException(status_code=401, detail="Group not found")

    matches = db.query(Member).filter(
        Member.group_id == group.id,
        Member.full_name.ilike(request.full_name.strip())
    ).all()

    if not matches:
        raise HTTPException(status_code=401, detail="Member not found in this group")

    if len(matches) > 1:
        raise HTTPException(
            status_code=409,
            detail="More than one member with this name exists in the group. Please contact your admin to resolve the naming conflict."
        )

    member = matches[0]

    if not member.password_hash or not verify_password(request.password, member.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    if not member.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    return LoginResponse(
        success=True,
        member_id=member.id,
        group_id=member.group_id,
        group_name=group.name,
        full_name=member.full_name,
        role=member.role,
        token=f"token-{member.id}-{datetime.now().timestamp()}"
    )

# ==================== MEMBER DASHBOARD ENDPOINTS ====================

def _build_dashboard_payload(member_id: int, db: Session) -> DashboardResponse:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    group = db.query(Group).filter(Group.id == member.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    recent_transactions = db.query(Transaction).filter(Transaction.member_id == member_id)\
        .order_by(Transaction.created_at.desc()).limit(10).all()
        
    active_loans = db.query(Loan).filter(
        Loan.member_id == member_id, 
        Loan.status == LoanStatus.ACTIVE
    ).all()
    
    savings_goal = db.query(SavingsGoal).filter(SavingsGoal.member_id == member_id).first()
    
    recent_notes = db.query(DailyNote).filter(DailyNote.member_id == member_id)\
        .order_by(DailyNote.note_date.desc()).limit(5).all()
        
    unread_notifications = db.query(Notification).filter(
        Notification.member_id == member_id, 
        Notification.is_read == False
    ).count()
    
    group_members = db.query(Member).filter(Member.group_id == group.id, Member.is_active == True).all()

    group_resp = GroupResponse.model_validate(group)
    group_resp.member_count = len(group_members)
    group_resp.total_savings = sum(m.savings_balance for m in group_members)

    member_profile = MemberProfileResponse.model_validate(member)
    member_profile.group_name = group.name
    member_profile.savings_balance = member.savings_balance or 0.0

    goal_resp = None
    if savings_goal:
        goal_resp = SavingsGoalResponse.model_validate(savings_goal)
        if savings_goal.target_amount > 0:
            goal_resp.progress_percent = round((savings_goal.current_amount / savings_goal.target_amount) * 100, 1)

    return DashboardResponse(
        member=member_profile,
        group=group_resp,
        recent_transactions=[TransactionResponse.model_validate(t) for t in recent_transactions],
        active_loans=[LoanResponse.model_validate(l) for l in active_loans],
        savings_goal=goal_resp,
        recent_notes=[DailyNoteResponse.model_validate(n) for n in recent_notes],
        unread_notifications=unread_notifications,
        group_members=[MemberResponse.model_validate(m) for m in group_members]
    )

@app.get("/api/members/{member_id}/dashboard", response_model=DashboardResponse)
@app.get("/members/{member_id}/dashboard", response_model=DashboardResponse)
@app.get("/api/members/{member_id}", response_model=DashboardResponse)
def get_member_dashboard(member_id: int, db: Session = Depends(get_db)):
    """Fetch dashboard payload for member with exact route match support"""
    return _build_dashboard_payload(member_id, db)

# ==================== GROUP ENDPOINTS ====================

@app.get("/api/groups", response_model=List[GroupResponse])
def get_groups(db: Session = Depends(get_db)):
    groups = db.query(Group).all()
    result = []
    for g in groups:
        member_count = db.query(Member).filter(Member.group_id == g.id, Member.is_active == True).count()
        total_savings = db.query(Member).filter(Member.group_id == g.id).with_entities(Member.savings_balance).all()
        total = sum(s[0] for s in total_savings) if total_savings else 0.0

        grp = GroupResponse.model_validate(g)
        grp.member_count = member_count
        grp.total_savings = total
        result.append(grp)
    return result

@app.get("/api/groups/{group_id}", response_model=GroupSummaryResponse)
def get_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    members = db.query(Member).filter(Member.group_id == group_id, Member.is_active == True).all()
    total_savings = sum(m.savings_balance for m in members)
    total_shares = sum(m.total_shares for m in members)

    active_loans = db.query(Loan).filter(Loan.group_id == group_id, Loan.status == LoanStatus.ACTIVE).count()
    paid_loans = db.query(Loan).filter(Loan.group_id == group_id, Loan.status == LoanStatus.PAID_OFF).count()

    recent_tx = db.query(Transaction).filter(Transaction.group_id == group_id).order_by(Transaction.created_at.desc()).limit(10).all()

    top_members = sorted(members, key=lambda m: m.savings_balance, reverse=True)[:5]

    group_resp = GroupResponse.model_validate(group)
    group_resp.member_count = len(members)
    group_resp.total_savings = total_savings

    return GroupSummaryResponse(
        group=group_resp,
        total_members=len(members),
        total_savings=total_savings,
        total_loans_active=active_loans,
        total_loans_paid=paid_loans,
        total_shares=total_shares,
        recent_transactions=[TransactionResponse.model_validate(t) for t in recent_tx],
        top_members=[MemberResponse.model_validate(m) for m in top_members]
    )

# ==================== ADDED TAB ENDPOINTS ====================

# --- 1. History / Transactions Tab ---
@app.get("/api/members/{member_id}/transactions", response_model=List[TransactionResponse])
@app.get("/members/{member_id}/transactions", response_model=List[TransactionResponse])
def get_member_transactions(member_id: int, db: Session = Depends(get_db)):
    transactions = db.query(Transaction).filter(Transaction.member_id == member_id)\
        .order_by(Transaction.created_at.desc()).all()
    return [TransactionResponse.model_validate(t) for t in transactions]

@app.post("/api/members/{member_id}/transactions", response_model=TransactionResponse)
@app.post("/members/{member_id}/transactions", response_model=TransactionResponse)
def create_transaction(member_id: int, tx: TransactionCreate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    db_tx = Transaction(
        group_id=member.group_id,
        member_id=member_id,
        type=tx.type,
        amount=tx.amount,
        currency=tx.currency,
        method=tx.method,
        description=tx.description,
        reference=tx.reference
    )
    
    if tx.type == TransactionType.DEPOSIT:
        member.savings_balance += tx.amount
    elif tx.type == TransactionType.WITHDRAWAL:
        if member.savings_balance < tx.amount:
            raise HTTPException(status_code=400, detail="Insufficient funds")
        member.savings_balance -= tx.amount
        
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    return TransactionResponse.model_validate(db_tx)

# --- 2. Chat Tab ---
@app.get("/api/groups/{group_id}/messages", response_model=List[ChatMessageResponse])
@app.get("/groups/{group_id}/messages", response_model=List[ChatMessageResponse])
def get_chat_messages(group_id: int, db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).filter(ChatMessage.group_id == group_id)\
        .order_by(ChatMessage.created_at.asc()).all()
    
    res = []
    for m in messages:
        msg_data = ChatMessageResponse.model_validate(m)
        if m.member:
            msg_data.member_name = m.member.full_name
        res.append(msg_data)
    return res
# --- Fix GET /members/{member_id}/messages ---
@app.get("/members/{member_id}/messages", response_model=List[ChatMessageResponse])
@app.get("/api/members/{member_id}/messages", response_model=List[ChatMessageResponse])
def get_member_messages_alias(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    messages = db.query(ChatMessage).filter(ChatMessage.group_id == member.group_id)\
        .order_by(ChatMessage.created_at.asc()).all()
    
    res = []
    for m in messages:
        msg_data = ChatMessageResponse.model_validate(m)
        if m.member:
            msg_data.member_name = m.member.full_name
        res.append(msg_data)
    return res

# --- Fix GET /members/{member_id} (Returns pure Member Profile) ---
@app.get("/members/{member_id}", response_model=MemberProfileResponse)
def get_member_profile_only(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    group = db.query(Group).filter(Group.id == member.group_id).first()
    profile = MemberProfileResponse.model_validate(member)
    profile.group_name = group.name if group else None
    return profile

# --- Fix POST /members/{member_id}/deposit ---
class DepositRequest(BaseModel):
    amount: float = Field(gt=0)
    method: Optional[PaymentMethod] = PaymentMethod.AIRTEL_MONEY
    currency: str = "MWK"
    description: Optional[str] = "Deposit"

@app.post("/members/{member_id}/deposit", response_model=TransactionResponse)
@app.post("/api/members/{member_id}/deposit", response_model=TransactionResponse)
def member_deposit(member_id: int, req: DepositRequest, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Update balance
    member.savings_balance += req.amount

    # Create transaction log
    db_tx = Transaction(
        group_id=member.group_id,
        member_id=member.id,
        type=TransactionType.DEPOSIT,
        amount=req.amount,
        currency=req.currency,
        method=req.method,
        description=req.description or "Member Deposit"
    )
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    return TransactionResponse.model_validate(db_tx)
@app.post("/api/groups/{group_id}/messages", response_model=ChatMessageResponse)
@app.post("/groups/{group_id}/messages", response_model=ChatMessageResponse)
def create_chat_message(group_id: int, msg: ChatMessageCreate, member_id: int, db: Session = Depends(get_db)):
    db_msg = ChatMessage(
        group_id=group_id,
        member_id=member_id,
        sender=msg.sender,
        text=msg.text
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return ChatMessageResponse.model_validate(db_msg)

# --- 3. Loans Tab ---
@app.get("/api/members/{member_id}/loans", response_model=List[LoanResponse])
@app.get("/members/{member_id}/loans", response_model=List[LoanResponse])
def get_member_loans(member_id: int, db: Session = Depends(get_db)):
    loans = db.query(Loan).filter(Loan.member_id == member_id).all()
    return [LoanResponse.model_validate(l) for l in loans]

@app.post("/api/members/{member_id}/loans", response_model=LoanResponse)
@app.post("/members/{member_id}/loans", response_model=LoanResponse)
def apply_for_loan(member_id: int, loan: LoanCreate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    loan_num = generate_loan_number(db, member.group_id)
    monthly = (loan.principal * (1 + loan.interest_rate / 100)) / loan.duration_months

    db_loan = Loan(
        group_id=member.group_id,
        member_id=member_id,
        loan_number=loan_num,
        title=loan.title,
        purpose=loan.purpose,
        principal=loan.principal,
        interest_rate=loan.interest_rate,
        duration_months=loan.duration_months,
        monthly_payment=round(monthly, 2),
        status=LoanStatus.PENDING
    )
    db.add(db_loan)
    db.commit()
    db.refresh(db_loan)
    return LoanResponse.model_validate(db_loan)

# --- 4. Notes Tab ---
@app.get("/api/members/{member_id}/notes", response_model=List[DailyNoteResponse])
@app.get("/members/{member_id}/notes", response_model=List[DailyNoteResponse])
def get_member_notes(member_id: int, db: Session = Depends(get_db)):
    notes = db.query(DailyNote).filter(DailyNote.member_id == member_id)\
        .order_by(DailyNote.note_date.desc()).all()
    return [DailyNoteResponse.model_validate(n) for n in notes]

@app.post("/api/members/{member_id}/notes", response_model=DailyNoteResponse)
@app.post("/members/{member_id}/notes", response_model=DailyNoteResponse)
def create_note(member_id: int, note: DailyNoteCreate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db_note = DailyNote(
        group_id=member.group_id,
        member_id=member_id,
        text=note.text,
        mood=note.mood
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return DailyNoteResponse.model_validate(db_note)
# ==================== ADMIN / DEVELOPER CONTROL ENDPOINTS ====================

class AdminGroupOverview(BaseModel):
    id: int
    group_id: str
    name: str
    interest_rate: float
    share_value: float
    cycle_duration_months: int
    created_at: datetime
    member_count: int
    total_savings: float
    active_loans_count: int
    admin_name: Optional[str] = "N/A"
    admin_identifier: Optional[str] = "N/A"

    class Config:
        from_attributes = True

class DeveloperDashboardStats(BaseModel):
    total_groups: int
    total_registered_members: int
    total_platform_savings: float
    total_active_loans: int
    groups: List[AdminGroupOverview]

@app.get("/api/admin/developer-overview", response_model=DeveloperDashboardStats)
@app.get("/admin/developer-overview", response_model=DeveloperDashboardStats)
def get_developer_control_overview(db: Session = Depends(get_db)):
    """Developer route to inspect registered groups and system-wide metrics"""
    groups = db.query(Group).order_by(Group.created_at.desc()).all()
    
    group_summaries = []
    platform_savings = 0.0
    platform_members = 0
    platform_loans = 0

    for g in groups:
        # Get active group members
        members = db.query(Member).filter(Member.group_id == g.id, Member.is_active == True).all()
        m_count = len(members)
        
        # Calculate group financial totals
        g_savings = sum(m.savings_balance or 0.0 for m in members)
        g_loans = db.query(Loan).filter(Loan.group_id == g.id, Loan.status == LoanStatus.ACTIVE).count()
        
        # Locate group admin contact
        admin_member = db.query(Member).filter(Member.group_id == g.id, Member.role == MemberRole.ADMIN).first()

        # Update global platform tallies
        platform_savings += g_savings
        platform_members += m_count
        platform_loans += g_loans

        group_summaries.append(
            AdminGroupOverview(
                id=g.id,
                group_id=g.group_id,
                name=g.name,
                interest_rate=g.interest_rate,
                share_value=g.share_value,
                cycle_duration_months=g.cycle_duration_months,
                created_at=g.created_at,
                member_count=m_count,
                total_savings=g_savings,
                active_loans_count=g_loans,
                admin_name=admin_member.full_name if admin_member else "N/A",
                admin_identifier=admin_member.identifier or admin_member.email or admin_member.phone if admin_member else "N/A"
            )
        )

    return DeveloperDashboardStats(
        total_groups=len(groups),
        total_registered_members=platform_members,
        total_platform_savings=platform_savings,
        total_active_loans=platform_loans,
        groups=group_summaries
    )
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
