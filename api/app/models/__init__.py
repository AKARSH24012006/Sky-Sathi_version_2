"""Production schema. Relationships:
users 1-* flights 1-* sessions 1-* sensor_events
users 1-* conversations 1-* messages
users 1-1 preferences, 1-* achievements, 1-* journal_entries, 1-1 premium
users 1-* notifications, 1-* feedback, 1-* audit_logs
turbulence_reports are k-anonymized: keyed by route cell + time bucket, NOT user.
kb_chunks carry pgvector embeddings for RAG."""
import uuid, datetime as dt
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from ..db import Base

def uid() -> str: return uuid.uuid4().hex
def now() -> dt.datetime: return dt.datetime.utcnow()

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(10), default="guest")   # guest|email|google|apple
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    pw_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    oauth_sub: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    name: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    deleted_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)  # soft delete -> purge job
    flights = relationship("Flight", back_populates="user")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    jti: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)

class Preference(Base):
    __tablename__ = "preferences"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    fear: Mapped[str | None] = mapped_column(String(20))       # turbulence|takeoff|sounds|panic
    experience: Mapped[str | None] = mapped_column(String(10))
    panic_level: Mapped[str | None] = mapped_column(String(10))
    tone: Mapped[str] = mapped_column(String(10), default="warm")
    narration: Mapped[str] = mapped_column(String(10), default="key")
    language: Mapped[str] = mapped_column(String(5), default="en")
    voice_name: Mapped[str | None] = mapped_column(String(80))
    seat: Mapped[str] = mapped_column(String(10), default="window")
    meal: Mapped[str] = mapped_column(String(10), default="veg")
    a11y: Mapped[dict] = mapped_column(JSON, default=dict)     # contrast/cb/onehand/simple

class Flight(Base):
    __tablename__ = "flights"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    flight_no: Mapped[str] = mapped_column(String(10))
    origin: Mapped[str] = mapped_column(String(4))
    dest: Mapped[str] = mapped_column(String(4))
    aircraft: Mapped[str | None] = mapped_column(String(20))
    airline: Mapped[str | None] = mapped_column(String(40))
    depart_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    gate: Mapped[str | None] = mapped_column(String(8))
    status: Mapped[str] = mapped_column(String(12), default="planned")  # planned|active|done
    rating: Mapped[int | None] = mapped_column(Integer)                 # 0..4 calm rating
    minutes: Mapped[int | None] = mapped_column(Integer)
    user = relationship("User", back_populates="flights")
    sessions = relationship("FlightSession", back_populates="flight")

class FlightSession(Base):
    """One app session during a flight; sensor events hang off it."""
    __tablename__ = "flight_sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    flight_id: Mapped[str] = mapped_column(ForeignKey("flights.id"), index=True)
    started_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    device: Mapped[str | None] = mapped_column(String(60))
    detector_version: Mapped[str | None] = mapped_column(String(20))
    flight = relationship("Flight", back_populates="sessions")

class SensorEvent(Base):
    """Aggregated feature windows, NOT raw streams. Raw stays on-device.
    Retention: purged 90 days after model-training aggregation."""
    __tablename__ = "sensor_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("flight_sessions.id"), index=True)
    t: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    phase_detected: Mapped[str] = mapped_column(String(16))
    confidence: Mapped[float] = mapped_column(Float)
    vert_var: Mapped[float] = mapped_column(Float)
    alt_rate: Mapped[float | None] = mapped_column(Float)
    gspd: Mapped[float | None] = mapped_column(Float)
    db_level: Mapped[float | None] = mapped_column(Float)

class TurbulenceReport(Base):
    """Crowdsourced network. k-anonymized by design: no user reference."""
    __tablename__ = "turbulence_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_cell: Mapped[str] = mapped_column(String(20), index=True)   # e.g. geohash5 or DEL-BLR:seg3
    time_bucket: Mapped[str] = mapped_column(String(16), index=True)  # e.g. 2026-07-10T14
    energy: Mapped[float] = mapped_column(Float)
    __table_args__ = (Index("ix_turb_cell_bucket", "route_cell", "time_bucket"),)

class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    mode: Mapped[str] = mapped_column(String(10), default="flight")  # flight|airport
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    messages = relationship("Message", back_populates="conversation")

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text)
    anxiety_band: Mapped[str | None] = mapped_column(String(8))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    conversation = relationship("Conversation", back_populates="messages")

class KBChunk(Base):
    __tablename__ = "kb_chunks"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    category: Mapped[str] = mapped_column(String(24), index=True)
    text: Mapped[str] = mapped_column(Text)
    calm: Mapped[str | None] = mapped_column(Text)
    embedding: Mapped[list] = mapped_column(Vector(1024))            # bge-m3
    version: Mapped[str] = mapped_column(String(12), default="v1")

class Achievement(Base):
    __tablename__ = "achievements"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(24), primary_key=True)   # first_flight|curious|zen|scholar
    won_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    flight_id: Mapped[str | None] = mapped_column(ForeignKey("flights.id"))
    note: Mapped[str | None] = mapped_column(Text)
    photo_url: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class Premium(Base):
    __tablename__ = "premium"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    plan: Mapped[str] = mapped_column(String(12), default="free")    # free|per_flight|annual|family
    store: Mapped[str | None] = mapped_column(String(10))            # apple|google|upi
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    receipt: Mapped[str | None] = mapped_column(Text)

class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))                    # boarding|gate|family_landing...
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    sent_at: Mapped[dt.datetime | None] = mapped_column(DateTime)

class PushToken(Base):
    __tablename__ = "push_tokens"
    token: Mapped[str] = mapped_column(String(200), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    platform: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class AnalyticsEvent(Base):
    """Product analytics, pseudonymous. Consent-gated at the client."""
    __tablename__ = "analytics_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(40), index=True)
    props: Mapped[dict] = mapped_column(JSON, default=dict)
    t: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    rating: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class AuditLog(Base):
    """Security-relevant actions: logins, exports, deletions, token rotations."""
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(40))
    ip: Mapped[str | None] = mapped_column(String(45))
    t: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
