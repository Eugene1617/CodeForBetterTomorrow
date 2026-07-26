# main.py
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey, Enum, UniqueConstraint, func
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from pydantic import BaseModel, Field, EmailStr
import bcrypt
from datetime import datetime, timedelta
from typing import List, Optional
import enum
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
    WITHDRAWAL = "withdrawal"
    INTEREST = "interest"
    CREDIT_SCORE = "credit_score"
    LOAN_DUE = "loan_due"
    LOAN_APPROVED = "loan_approved"
    LOAN_REPAYMENT = "loan_repayment"
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
    currency = Column(String, default="MWK")
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
    name = Column(String, nullable=False)
    target_amount = Column(Float, nullable=False)
    current_amount = Column(Float, default=0.0)
    icon = Column(String, nullable=True)

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
    savings_balance: float
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
    currency: str = "MWK"
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
    name: str = Field(..., min_length=1)
    target_amount: float = Field(..., gt=0)
    current_amount: float = Field(default=0.0, ge=0)
    icon: Optional[str] = None

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

class DepositRequest(BaseModel):
    amount: float = Field(gt=0)
    method: PaymentMethod
    phone: Optional[str] = None
    pin: Optional[str] = None

class WithdrawRequest(BaseModel):
    amount: float = Field(gt=0)
    method: PaymentMethod
    phone: Optional[str] = None

class LoanRequest(BaseModel):
    amount: float = Field(gt=0)
    purpose: LoanPurpose
    duration_months: int = Field(ge=3, le=24)

class LoanRepaymentRequest(BaseModel):
    amount: float = Field(gt=0)

class LoanApprovalRequest(BaseModel):
    approver_id: int

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
    confirm_password: str

class InviteMemberRequest(BaseModel):
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    identifier: Optional[str] = None
    role: MemberRole = MemberRole.MEMBER
    initial_password: str = Field(..., min_length=8, description="Temporary password set by the admin/treasurer; the member can change it after logging in")

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

# ==================== AUTH & GROUP REGISTRATION ====================

@app.post("/api/auth/register-group", response_model=GroupResponse)
def register_group(request: GroupRegistrationRequest, db: Session = Depends(get_db)):
    """Create a new savings group with admin/treasurer account"""

    existing_group = db.query(Group).filter(Group.name.ilike(request.group_name.strip())).first()
    if existing_group:
        raise HTTPException(status_code=400, detail="A group with this name already exists")

    group = Group(
        group_id=generate_group_id(db),
        name=request.group_name.strip(),
        interest_rate=request.interest_rate,
        share_value=100.0,
        cycle_duration_months=12
    )
    db.add(group)
    db.flush()

    admin = Member(
        member_id=generate_member_id(db, group.id),
        group_id=group.id,
        full_name=request.admin_name.strip(),
        identifier=request.identifier.strip() if request.identifier else None,
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
    """Login with member name, group name, and password"""

    group = db.query(Group).filter(
        func.lower(func.trim(Group.name)) == request.group_name.strip().lower()
    ).first()
    if not group:
        raise HTTPException(status_code=401, detail="Group not found")

    matches = db.query(Member).filter(
        Member.group_id == group.id,
        func.lower(func.trim(Member.full_name)) == request.full_name.strip().lower()
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

    token = f"TOKEN-{member.id}-{datetime.utcnow().timestamp()}"

    return LoginResponse(
        success=True,
        member_id=member.id,
        group_id=group.id,
        group_name=group.name,
        full_name=member.full_name,
        role=member.role,
        token=token
    )

# ==================== GROUP ENDPOINTS ====================

@app.get("/api/groups", response_model=List[GroupResponse])
def get_groups(db: Session = Depends(get_db)):
    groups = db.query(Group).all()
    result = []
    for g in groups:
        member_count = db.query(Member).filter(Member.group_id == g.id, Member.is_active == True).count()
        total_savings = db.query(Member).filter(Member.group_id == g.id, Member.is_active == True).with_entities(Member.savings_balance).all()
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

@app.put("/api/groups/{group_id}", response_model=GroupResponse)
def update_group(group_id: int, update: GroupUpdate, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        if field == "name" and value:
            setattr(group, field, value.strip())
        else:
            setattr(group, field, value)

    db.commit()
    db.refresh(group)

    member_count = db.query(Member).filter(Member.group_id == group.id, Member.is_active == True).count()
    total_savings = sum(m.savings_balance for m in db.query(Member).filter(Member.group_id == group.id, Member.is_active == True).all())

    resp = GroupResponse.model_validate(group)
    resp.member_count = member_count
    resp.total_savings = total_savings
    return resp

@app.delete("/api/groups/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    db.delete(group)
    db.commit()
    return {"message": "Group deleted successfully"}

# ==================== MEMBER ENDPOINTS ====================

@app.get("/api/groups/{group_id}/members", response_model=List[MemberResponse])
def get_group_members(group_id: int, role: Optional[MemberRole] = None, db: Session = Depends(get_db)):
    query = db.query(Member).filter(Member.group_id == group_id, Member.is_active == True)
    if role:
        query = query.filter(Member.role == role)
    return query.all()

@app.get("/api/members/{member_id}", response_model=MemberProfileResponse)
def get_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    resp = MemberProfileResponse.model_validate(member)
    resp.group_name = member.group.name if member.group else None
    return resp

@app.post("/api/groups/{group_id}/members", response_model=MemberResponse)
def invite_member(group_id: int, request: InviteMemberRequest, db: Session = Depends(get_db)):
    """Invite a new member to the group (Admin/Treasurer only)"""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    identifier = request.identifier or request.phone or request.email
    if not identifier:
        raise HTTPException(status_code=400, detail="An identifier, phone, or email is required")

    # Check if identifier already exists in this group (consistent with DB unique constraint)
    existing = db.query(Member).filter(Member.group_id == group_id, Member.identifier == identifier).first()
    if existing:
        raise HTTPException(status_code=400, detail="Member with this identifier already exists in this group")

    member = Member(
        member_id=generate_member_id(db, group_id),
        group_id=group_id,
        full_name=request.full_name.strip(),
        email=request.email.strip() if request.email else None,
        phone=request.phone.strip() if request.phone else None,
        identifier=identifier.strip() if identifier else None,
        password_hash=hash_password(request.initial_password),
        role=request.role,
        savings_balance=0.0,
        credit_score=700,
        joined_at=datetime.utcnow()
    )
    db.add(member)
    db.flush()

    notification = Notification(
        group_id=group_id,
        member_id=member.id,
        type=NotificationType.GROUP_INVITE,
        title="Welcome to the Group",
        description=f"You have been invited to join {group.name}"
    )
    db.add(notification)

    db.commit()
    db.refresh(member)
    return member

@app.put("/api/members/{member_id}", response_model=MemberResponse)
def update_member(member_id: int, update: MemberUpdate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        if field == "password" and value:
            member.password_hash = hash_password(value)
        elif field in ("full_name", "identifier", "email", "phone") and value:
            setattr(member, field, value.strip())
        else:
            setattr(member, field, value)

    db.commit()
    db.refresh(member)
    return member

@app.delete("/api/members/{member_id}")
def deactivate_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member.is_active = False
    db.commit()
    return {"message": "Member deactivated successfully"}

# ==================== DASHBOARD ENDPOINT ====================
@app.get("/api/members/{member_id}/dashboard", response_model=DashboardResponse)
def get_dashboard(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    group = member.group
    recent_transactions = db.query(Transaction).filter(Transaction.member_id == member_id).order_by(Transaction.created_at.desc()).limit(10).all()
    active_loans = db.query(Loan).filter(Loan.member_id == member_id, Loan.status == LoanStatus.ACTIVE).all()
    savings_goal = db.query(SavingsGoal).filter(SavingsGoal.member_id == member_id).first()
    recent_notes = db.query(DailyNote).filter(DailyNote.member_id == member_id).order_by(DailyNote.note_date.desc()).limit(5).all()
    unread_count = db.query(Notification).filter(Notification.member_id == member_id, Notification.is_read == False).count()
    group_members = db.query(Member).filter(Member.group_id == member.group_id, Member.is_active == True, Member.id != member_id).all()

    member_resp = MemberProfileResponse.model_validate(member)
    member_resp.group_name = group.name if group else None

    group_resp = GroupResponse.model_validate(group) if group else None
    if group_resp:
        group_resp.member_count = db.query(Member).filter(Member.group_id == group.id, Member.is_active == True).count()
        group_resp.total_savings = sum(m.savings_balance for m in db.query(Member).filter(Member.group_id == group.id, Member.is_active == True).all())

    return DashboardResponse(
        member=member_resp,
        group=group_resp,
        recent_transactions=[TransactionResponse.model_validate(t) for t in recent_transactions],
        active_loans=[LoanResponse.model_validate(l) for l in active_loans],
        savings_goal=SavingsGoalResponse.model_validate(savings_goal) if savings_goal else None,
        recent_notes=[DailyNoteResponse.model_validate(n) for n in recent_notes],
        unread_notifications=unread_count,
        group_members=[MemberResponse.model_validate(m) for m in group_members]
    )

# ==================== TRANSACTION ENDPOINTS ====================

@app.get("/api/groups/{group_id}/transactions", response_model=List[TransactionResponse])
def get_group_transactions(group_id: int, member_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Transaction).filter(Transaction.group_id == group_id)
    if member_id:
        query = query.filter(Transaction.member_id == member_id)
    transactions = query.order_by(Transaction.created_at.desc()).all()
    result = []
    for t in transactions:
        resp = TransactionResponse.model_validate(t)
        resp.member_name = t.member.full_name if t.member else None
        result.append(resp)
    return result

@app.get("/api/members/{member_id}/transactions", response_model=List[TransactionResponse])
def get_member_transactions(member_id: int, db: Session = Depends(get_db)):
    transactions = db.query(Transaction).filter(Transaction.member_id == member_id).order_by(Transaction.created_at.desc()).all()
    result = []
    for t in transactions:
        resp = TransactionResponse.model_validate(t)
        resp.member_name = t.member.full_name if t.member else None
        result.append(resp)
    return result

@app.post("/api/members/{member_id}/deposit")
def make_deposit(member_id: int, request: DepositRequest, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    transaction = Transaction(
        group_id=member.group_id,
        member_id=member_id,
        type=TransactionType.DEPOSIT,
        amount=request.amount,
        method=request.method,
        description=f"Deposit via {request.method.value}"
    )
    db.add(transaction)

    member.savings_balance += request.amount
    member.total_shares = int(member.savings_balance / (member.group.share_value if member.group else 100))

    notification = Notification(
        group_id=member.group_id,
        member_id=member_id,
        type=NotificationType.DEPOSIT,
        title="Deposit Successful",
        description=f"MWK {request.amount:.2f} has been added to your savings"
    )
    db.add(notification)

    db.commit()
    return {"message": "Deposit successful", "new_balance": member.savings_balance, "shares": member.total_shares}

@app.post("/api/members/{member_id}/withdraw")
def make_withdrawal(member_id: int, request: WithdrawRequest, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.savings_balance < request.amount:
        raise HTTPException(status_code=400, detail="Insufficient funds")

    transaction = Transaction(
        group_id=member.group_id,
        member_id=member_id,
        type=TransactionType.WITHDRAWAL,
        amount=request.amount,
        method=request.method,
        description=f"Withdrawal via {request.method.value}"
    )
    db.add(transaction)

    member.savings_balance -= request.amount
    member.total_shares = int(member.savings_balance / (member.group.share_value if member.group else 100))

    notification = Notification(
        group_id=member.group_id,
        member_id=member_id,
        type=NotificationType.WITHDRAWAL,
        title="Withdrawal Successful",
        description=f"MWK {request.amount:.2f} has been withdrawn from your savings"
    )
    db.add(notification)

    db.commit()
    return {"message": "Withdrawal successful", "new_balance": member.savings_balance, "shares": member.total_shares}

# ==================== LOAN ENDPOINTS ====================

@app.get("/api/groups/{group_id}/loans", response_model=List[LoanResponse])
def get_group_loans(group_id: int, status: Optional[LoanStatus] = None, db: Session = Depends(get_db)):
    query = db.query(Loan).filter(Loan.group_id == group_id)
    if status:
        query = query.filter(Loan.status == status)
    loans = query.order_by(Loan.created_at.desc()).all()
    result = []
    for l in loans:
        resp = LoanResponse.model_validate(l)
        resp.member_name = l.member.full_name if l.member else None
        result.append(resp)
    return result

@app.get("/api/members/{member_id}/loans", response_model=List[LoanResponse])
def get_member_loans(member_id: int, db: Session = Depends(get_db)):
    loans = db.query(Loan).filter(Loan.member_id == member_id).order_by(Loan.created_at.desc()).all()
    result = []
    for l in loans:
        resp = LoanResponse.model_validate(l)
        resp.member_name = l.member.full_name if l.member else None
        result.append(resp)
    return result

@app.post("/api/members/{member_id}/loans", response_model=LoanResponse)
def request_loan(member_id: int, loan: LoanCreate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    loan_number = generate_loan_number(db, member.group_id)
    interest = loan.principal * (loan.interest_rate / 100)
    total = loan.principal + interest
    monthly = total / loan.duration_months

    db_loan = Loan(
        group_id=member.group_id,
        member_id=member_id,
        loan_number=loan_number,
        total_paid=0.0,
        status=LoanStatus.PENDING,
        monthly_payment=monthly,
        due_date=datetime.now() + timedelta(days=30*loan.duration_months),
        **loan.model_dump()
    )
    db.add(db_loan)
    db.flush()

    notification = Notification(
        group_id=member.group_id,
        member_id=member_id,
        type=NotificationType.LOAN_APPROVED,
        title="Loan Request Submitted",
        description=f"Your loan request for MWK {loan.principal:.2f} is being reviewed"
    )
    db.add(notification)

    db.commit()
    db.refresh(db_loan)
    return db_loan

@app.post("/api/loans/{loan_id}/approve")
def approve_loan(loan_id: int, request: LoanApprovalRequest, db: Session = Depends(get_db)):
    """Approve a pending loan (Admin/Treasurer only)"""
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    approver = db.query(Member).filter(Member.id == request.approver_id).first()
    if not approver or approver.role not in [MemberRole.ADMIN, MemberRole.TREASURER]:
        raise HTTPException(status_code=403, detail="Only admin or treasurer can approve loans")

    if loan.status != LoanStatus.PENDING:
        raise HTTPException(status_code=400, detail="Loan is not pending approval")

    loan.status = LoanStatus.ACTIVE
    loan.approved_by = request.approver_id

    # Disburse loan amount to member
    member = db.query(Member).filter(Member.id == loan.member_id).first()
    member.savings_balance += loan.principal
    member.total_shares = int(member.savings_balance / (member.group.share_value if member.group else 100))

    transaction = Transaction(
        group_id=loan.group_id,
        member_id=loan.member_id,
        type=TransactionType.LOAN_DISBURSEMENT,
        amount=loan.principal,
        description=f"Loan disbursement for {loan.loan_number}"
    )
    db.add(transaction)

    notification = Notification(
        group_id=loan.group_id,
        member_id=loan.member_id,
        type=NotificationType.LOAN_APPROVED,
        title="Loan Approved",
        description=f"Your loan {loan.loan_number} for MWK {loan.principal:.2f} has been approved"
    )
    db.add(notification)

    db.commit()
    return {"message": "Loan approved and disbursed", "loan_number": loan.loan_number}

@app.post("/api/members/{member_id}/loans/{loan_id}/repay")
def repay_loan(member_id: int, loan_id: int, request: LoanRepaymentRequest, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    loan = db.query(Loan).filter(Loan.id == loan_id, Loan.member_id == member_id).first()

    if not member or not loan:
        raise HTTPException(status_code=404, detail="Not found")

    amount = request.amount
    if member.savings_balance < amount:
        raise HTTPException(status_code=400, detail="Insufficient funds")

    loan.total_paid += amount
    member.savings_balance -= amount
    member.total_shares = int(member.savings_balance / (member.group.share_value if member.group else 100))

    transaction = Transaction(
        group_id=member.group_id,
        member_id=member_id,
        type=TransactionType.LOAN_REPAYMENT,
        amount=amount,
        description=f"Loan repayment for {loan.loan_number}"
    )
    db.add(transaction)

    notification = Notification(
        group_id=member.group_id,
        member_id=member_id,
        type=NotificationType.LOAN_REPAYMENT,
        title="Loan Repayment Successful",
        description=f"MWK {amount:.2f} has been repaid for loan {loan.loan_number}"
    )
    db.add(notification)

    total_due = loan.principal * (1 + loan.interest_rate/100)
    if loan.total_paid >= total_due:
        loan.status = LoanStatus.PAID_OFF
        loan.paid_off_at = datetime.now()
        member.credit_score = min(850, member.credit_score + 10)

    db.commit()
    return {"message": "Repayment successful", "loan_status": loan.status.value, "remaining": max(0, total_due - loan.total_paid)}

# ==================== SAVINGS GOAL ENDPOINTS ====================

@app.get("/api/members/{member_id}/savings-goal", response_model=SavingsGoalResponse)
def get_savings_goal(member_id: int, db: Session = Depends(get_db)):
    goal = db.query(SavingsGoal).filter(SavingsGoal.member_id == member_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Savings goal not found")

    resp = SavingsGoalResponse.model_validate(goal)
    resp.progress_percent = round((goal.current_amount / goal.target_amount) * 100, 1) if goal.target_amount > 0 else 0
    return resp

@app.put("/api/members/{member_id}/savings-goal", response_model=SavingsGoalResponse)
def update_savings_goal(member_id: int, update: SavingsGoalUpdate, db: Session = Depends(get_db)):
    goal = db.query(SavingsGoal).filter(SavingsGoal.member_id == member_id).first()
    if not goal:
        member = db.query(Member).filter(Member.id == member_id).first()
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")
        goal = SavingsGoal(member_id=member_id, **update.model_dump(exclude_unset=True))
        db.add(goal)
    else:
        for field, value in update.model_dump(exclude_unset=True).items():
            setattr(goal, field, value)

    db.commit()
    db.refresh(goal)

    resp = SavingsGoalResponse.model_validate(goal)
    resp.progress_percent = round((goal.current_amount / goal.target_amount) * 100, 1) if goal.target_amount > 0 else 0
    return resp

# ==================== NOTES ENDPOINTS ====================

@app.get("/api/groups/{group_id}/notes", response_model=List[DailyNoteResponse])
def get_group_notes(group_id: int, db: Session = Depends(get_db)):
    notes = db.query(DailyNote).filter(DailyNote.group_id == group_id).order_by(DailyNote.note_date.desc()).all()
    result = []
    for n in notes:
        resp = DailyNoteResponse.model_validate(n)
        resp.member_name = n.member.full_name if n.member else None
        result.append(resp)
    return result

@app.get("/api/members/{member_id}/notes", response_model=List[DailyNoteResponse])
def get_member_notes(member_id: int, db: Session = Depends(get_db)):
    notes = db.query(DailyNote).filter(DailyNote.member_id == member_id).order_by(DailyNote.note_date.desc()).all()
    result = []
    for n in notes:
        resp = DailyNoteResponse.model_validate(n)
        resp.member_name = n.member.full_name if n.member else None
        result.append(resp)
    return result

@app.post("/api/members/{member_id}/notes", response_model=DailyNoteResponse)
def create_note(member_id: int, note: DailyNoteCreate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db_note = DailyNote(
        group_id=member.group_id,
        member_id=member_id,
        **note.model_dump()
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)

    resp = DailyNoteResponse.model_validate(db_note)
    resp.member_name = member.full_name
    return resp

# ==================== NOTIFICATION ENDPOINTS ====================

@app.get("/api/members/{member_id}/notifications", response_model=List[NotificationResponse])
def get_notifications(member_id: int, unread_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(Notification).filter(Notification.member_id == member_id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    return query.order_by(Notification.created_at.desc()).all()

@app.patch("/api/members/{member_id}/notifications/{notif_id}/read")
def mark_notification_read(member_id: int, notif_id: int, db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notif_id, Notification.member_id == member_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    return {"message": "Marked as read"}

@app.patch("/api/members/{member_id}/notifications/read-all")
def mark_all_read(member_id: int, db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.member_id == member_id, Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}

# ==================== CHAT ENDPOINTS ====================

@app.get("/api/groups/{group_id}/messages", response_model=List[ChatMessageResponse])
def get_group_messages(group_id: int, db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).filter(ChatMessage.group_id == group_id).order_by(ChatMessage.created_at.asc()).all()
    result = []
    for m in messages:
        resp = ChatMessageResponse.model_validate(m)
        resp.member_name = m.member.full_name if m.member else None
        result.append(resp)
    return result

@app.get("/api/members/{member_id}/messages", response_model=List[ChatMessageResponse])
def get_member_messages(member_id: int, db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).filter(ChatMessage.member_id == member_id).order_by(ChatMessage.created_at.asc()).all()
    result = []
    for m in messages:
        resp = ChatMessageResponse.model_validate(m)
        resp.member_name = m.member.full_name if m.member else None
        result.append(resp)
    return result

@app.post("/api/members/{member_id}/messages", response_model=ChatMessageResponse)
def send_message(member_id: int, message: ChatMessageCreate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db_message = ChatMessage(
        group_id=member.group_id,
        member_id=member_id,
        **message.model_dump()
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)

    resp = ChatMessageResponse.model_validate(db_message)
    resp.member_name = member.full_name
    return resp

# ==================== REPORT ENDPOINTS ====================

@app.get("/api/members/{member_id}/report")
def generate_member_report(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    transactions = db.query(Transaction).filter(Transaction.member_id == member_id).all()
    loans = db.query(Loan).filter(Loan.member_id == member_id).all()

    total_deposits = sum(t.amount for t in transactions if t.type == TransactionType.DEPOSIT)
    total_withdrawals = sum(t.amount for t in transactions if t.type == TransactionType.WITHDRAWAL)
    total_interest = sum(t.amount for t in transactions if t.type == TransactionType.INTEREST)
    total_repaid = sum(t.amount for t in transactions if t.type == TransactionType.LOAN_REPAYMENT)

    return {
        "member_name": member.full_name,
        "member_id": member.member_id,
        "group_name": member.group.name if member.group else None,
        "generated_at": datetime.now(),
        "summary": {
            "current_balance": member.savings_balance,
            "total_shares": member.total_shares,
            "total_deposits": total_deposits,
            "total_withdrawals": total_withdrawals,
            "total_interest_earned": total_interest,
            "total_loan_repayments": total_repaid,
            "credit_score": member.credit_score,
            "active_loans": len([l for l in loans if l.status == LoanStatus.ACTIVE]),
            "total_loans_taken": len(loans),
            "loans_paid_off": len([l for l in loans if l.status == LoanStatus.PAID_OFF])
        },
        "transactions": [
            {"type": t.type.value, "amount": t.amount, "date": t.created_at.isoformat(), "description": t.description, "method": t.method.value if t.method else None}
            for t in transactions
        ],
        "loans": [
            {"title": l.title, "principal": l.principal, "status": l.status.value, "total_paid": l.total_paid, "loan_number": l.loan_number}
            for l in loans
        ]
    }

@app.get("/api/groups/{group_id}/report")
def generate_group_report(group_id: int, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    members = db.query(Member).filter(Member.group_id == group_id, Member.is_active == True).all()
    transactions = db.query(Transaction).filter(Transaction.group_id == group_id).all()
    loans = db.query(Loan).filter(Loan.group_id == group_id).all()

    total_savings = sum(m.savings_balance for m in members)
    total_shares = sum(m.total_shares for m in members)
    total_deposits = sum(t.amount for t in transactions if t.type == TransactionType.DEPOSIT)
    total_loans_active = sum(l.principal for l in loans if l.status == LoanStatus.ACTIVE)
    total_loans_paid = sum(l.total_paid for l in loans if l.status == LoanStatus.PAID_OFF)

    return {
        "group_name": group.name,
        "group_id": group.group_id,
        "interest_rate": group.interest_rate,
        "share_value": group.share_value,
        "generated_at": datetime.now(),
        "summary": {
            "total_members": len(members),
            "total_savings": total_savings,
            "total_shares": total_shares,
            "total_deposits": total_deposits,
            "active_loans_outstanding": total_loans_active,
            "total_loans_repaid": total_loans_paid,
            "active_loan_count": len([l for l in loans if l.status == LoanStatus.ACTIVE]),
            "paid_loan_count": len([l for l in loans if l.status == LoanStatus.PAID_OFF])
        },
        "members": [
            {"name": m.full_name, "member_id": m.member_id, "balance": m.savings_balance, "shares": m.total_shares, "credit_score": m.credit_score}
            for m in members
        ],
        "recent_transactions": [
            {"type": t.type.value, "amount": t.amount, "date": t.created_at.isoformat(), "member_id": t.member_id}
            for t in sorted(transactions, key=lambda x: x.created_at, reverse=True)[:20]
        ]
    }

# ==================== HEALTH CHECK ====================
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "Titukulane+ API", "version": "2.0.0"}

# ==================== ENTRY POINT ====================
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
