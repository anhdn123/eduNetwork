"""SQLite: schema và tiện ích kết nối."""
import os
import sqlite3
import time

def _default_data_dir():
    """Mặc định: thư mục data/ cạnh mã nguồn. Nếu mã nguồn nằm trong OneDrive thì lưu ở %LOCALAPPDATA%
    (SQLite trong thư mục đồng bộ đám mây dễ bị khóa/hỏng, và dữ liệu học sinh không nên tự đẩy lên đám mây)."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if "onedrive" in root.lower() and os.environ.get("LOCALAPPDATA"):
        return os.path.join(os.environ["LOCALAPPDATA"], "LearningByAI", "data")
    return os.path.join(root, "data")


DATA_DIR = os.environ.get("LBAI_DATA") or _default_data_dir()
DB_PATH = os.path.join(DATA_DIR, "lbai.db")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','teacher','student','parent')),
  pw TEXT NOT NULL,
  class_id INTEGER,
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 0,
  bio TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS classes(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  owner_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parent_links(
  parent_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  PRIMARY KEY(parent_id, student_id)
);
CREATE TABLE IF NOT EXISTS bank(
  owner_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  t TEXT NOT NULL DEFAULT '',
  src TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  seq INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id, id)
);
CREATE TABLE IF NOT EXISTS images(
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exams(
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  variations TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments(
  id INTEGER PRIMARY KEY,
  exam_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  dist_mode TEXT NOT NULL DEFAULT 'alt',
  due_at INTEGER,
  duration_min INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  show_result INTEGER NOT NULL DEFAULT 1,
  closed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assignment_students(
  assignment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  variation INTEGER,
  PRIMARY KEY(assignment_id, student_id)
);
CREATE TABLE IF NOT EXISTS submissions(
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  variation INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  answers TEXT,
  score REAL,
  max_score INTEGER,
  details TEXT,
  late INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sub_as ON submissions(assignment_id, student_id);
CREATE TABLE IF NOT EXISTS essay_grades(
  submission_id INTEGER NOT NULL,
  qi INTEGER NOT NULL,
  score REAL NOT NULL,
  graded_by INTEGER,
  graded_at INTEGER NOT NULL,
  PRIMARY KEY(submission_id, qi)
);
CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Bài viết',
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'Công khai',
  file_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS post_likes(post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(post_id, user_id));
CREATE TABLE IF NOT EXISTS post_saves(post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(post_id, user_id));
CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS follows(user_id INTEGER NOT NULL, target_id INTEGER NOT NULL, PRIMARY KEY(user_id, target_id));
CREATE TABLE IF NOT EXISTS practice_topics(
  class_id INTEGER NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(class_id, subject, grade, topic)
);
CREATE TABLE IF NOT EXISTS practice(
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  topics TEXT NOT NULL DEFAULT '[]',
  questions TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 0,
  answers TEXT,
  score REAL,
  max_score INTEGER,
  details TEXT,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_practice_st ON practice(student_id, submitted_at);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT,
  at INTEGER NOT NULL
);
"""


def init():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    con = connect()
    con.executescript(SCHEMA)
    con.execute("PRAGMA journal_mode=WAL")
    con.commit()
    con.close()


def connect():
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con


def now() -> int:
    return int(time.time())
