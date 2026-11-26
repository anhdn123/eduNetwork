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
  count_bonus INTEGER NOT NULL DEFAULT 1,        -- 1: bài này được cộng điểm thưởng khi học sinh đạt mức thưởng; 0: không cộng
  count_penalty INTEGER NOT NULL DEFAULT 1,      -- 1: bài này bị trừ điểm khi quá hạn mà học sinh chưa nộp; 0: không trừ
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
  submitted_at INTEGER,
  scheme INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_practice_st ON practice(student_id, submitted_at);
CREATE TABLE IF NOT EXISTS bonus_config(
  class_id INTEGER PRIMARY KEY,
  mcq INTEGER NOT NULL DEFAULT 10,
  tf INTEGER NOT NULL DEFAULT 40,
  short INTEGER NOT NULL DEFAULT 50,
  updated_by INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bonus_log(
  practice_id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  class_id INTEGER,
  month TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  n_mcq INTEGER NOT NULL DEFAULT 0,
  n_tf INTEGER NOT NULL DEFAULT 0,
  n_short INTEGER NOT NULL DEFAULT 0,
  n_repeat INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bonus_month ON bonus_log(month, student_id);
CREATE TABLE IF NOT EXISTS bonus_q(
  student_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  qid TEXT NOT NULL,
  PRIMARY KEY(student_id, month, qid)
);
CREATE TABLE IF NOT EXISTS point_adjust(           -- giáo viên điều chỉnh điểm của học sinh (cộng/trừ kèm lý do), vd. miễn phạt vì nghỉ học
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,                      -- + cộng, − trừ
  reason TEXT NOT NULL,
  at INTEGER NOT NULL,
  month TEXT NOT NULL,
  created_by INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_padj_student ON point_adjust(student_id, month);
CREATE TABLE IF NOT EXISTS answer_reports(          -- học sinh báo đáp án sai (kèm ảnh); giáo viên/quản trị duyệt thì đáp án được sửa và bài đã nộp được chấm lại
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,                    -- giáo viên sở hữu bài/ngân hàng (người duyệt)
  source TEXT NOT NULL,                         -- assignment | practice
  source_id INTEGER NOT NULL,                   -- mã lần nộp (assignment) hoặc mã bài luyện tập (practice)
  assignment_id INTEGER,
  qi INTEGER NOT NULL,                          -- thứ tự câu trong bài học sinh làm
  qid TEXT NOT NULL DEFAULT '',                 -- mã câu hỏi trong ngân hàng
  snapshot TEXT NOT NULL,                       -- câu hỏi học sinh nhìn thấy + đáp án lúc báo (JSON)
  proposed TEXT,                                -- đáp án học sinh cho là đúng (JSON, có thể trống)
  note TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | approved | rejected
  created_at INTEGER NOT NULL,
  resolved_by INTEGER,
  resolved_at INTEGER,
  resolution TEXT NOT NULL DEFAULT '',
  new_ans TEXT,
  affected TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_rep_owner ON answer_reports(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_rep_stu ON answer_reports(student_id, source, source_id);
CREATE TABLE IF NOT EXISTS class_schedule(
  class_id INTEGER NOT NULL,
  from_date TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT '{}',
  fee INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(class_id, from_date)
);
CREATE TABLE IF NOT EXISTS attendance(
  student_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','absent','none')),
  class_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  marked_by INTEGER,
  marked_at INTEGER NOT NULL,
  late_min INTEGER NOT NULL DEFAULT 0,
  noisy INTEGER NOT NULL DEFAULT 0,           -- số lần mất trật tự trong buổi
  phone INTEGER NOT NULL DEFAULT 0,           -- số lần dùng điện thoại
  snack INTEGER NOT NULL DEFAULT 0,           -- số lần ăn quà vặt
  PRIMARY KEY(student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date);
CREATE TABLE IF NOT EXISTS att_close(           -- chốt điểm danh theo ngày + lớp
  date TEXT NOT NULL,
  class_id INTEGER NOT NULL,
  closed_by INTEGER,
  closed_at INTEGER NOT NULL,
  PRIMARY KEY(date, class_id)
);
CREATE TABLE IF NOT EXISTS att_rules(           -- quy tắc phạt muộn / thưởng điểm của từng giáo viên, đổi được theo tháng (áp dụng từ tháng đặt trở đi)
  owner_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  late_fee INTEGER NOT NULL DEFAULT 1000,       -- đồng / phút đi muộn
  reward_min REAL NOT NULL DEFAULT 8,           -- điểm bài kiểm tra tối thiểu (thang 10) để được thưởng
  reward_amount INTEGER NOT NULL DEFAULT 5000,  -- điểm thưởng mỗi bài kiểm tra đạt
  missed_penalty INTEGER NOT NULL DEFAULT 5000, -- điểm bị trừ cho mỗi bài được giao mà quá hạn vẫn chưa nộp
  discipline_fee INTEGER NOT NULL DEFAULT 5000, -- điểm bị trừ cho mỗi lần vi phạm trong buổi học (mất trật tự / dùng điện thoại / ăn quà vặt)
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id, month)
);
CREATE TABLE IF NOT EXISTS student_reward(      -- mức điểm được thưởng riêng của từng học sinh (reward_min < 0 = dùng mức mặc định)
  student_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  reward_min REAL NOT NULL,
  PRIMARY KEY(student_id, month)
);
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
    # nâng cấp CSDL cũ: thêm cột số phút đi muộn cho bảng điểm danh
    if "late_min" not in [r[1] for r in con.execute("PRAGMA table_info(attendance)").fetchall()]:
        con.execute("ALTER TABLE attendance ADD COLUMN late_min INTEGER NOT NULL DEFAULT 0")
    # bài được giao có được cộng điểm / bị trừ điểm hay không (giáo viên tick riêng từng loại ở tab Bài đã giao); mặc định có cả hai
    cols = [r[1] for r in con.execute("PRAGMA table_info(assignments)").fetchall()]
    for col in ("count_bonus", "count_penalty"):
        if col not in cols:
            con.execute(f"ALTER TABLE assignments ADD COLUMN {col} INTEGER NOT NULL DEFAULT 1")
    # số lần vi phạm trong buổi học (mất trật tự / dùng điện thoại / ăn quà vặt) và mức phạt mỗi lần
    acols = [r[1] for r in con.execute("PRAGMA table_info(attendance)").fetchall()]
    for col in ("noisy", "phone", "snack"):
        if col not in acols:
            con.execute(f"ALTER TABLE attendance ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0")
    if "discipline_fee" not in [r[1] for r in con.execute("PRAGMA table_info(att_rules)").fetchall()]:
        con.execute("ALTER TABLE att_rules ADD COLUMN discipline_fee INTEGER NOT NULL DEFAULT 5000")
    # quy tắc phạt bài được giao quá hạn không làm (mặc định trừ 5.000 điểm mỗi bài)
    if "missed_penalty" not in [r[1] for r in con.execute("PRAGMA table_info(att_rules)").fetchall()]:
        con.execute("ALTER TABLE att_rules ADD COLUMN missed_penalty INTEGER NOT NULL DEFAULT 5000")
    # bài tự luyện tính điểm theo thang mới (scheme=1: điểm thật theo dạng câu) khác bài cũ (scheme=0: số câu đúng)
    if "scheme" not in [r[1] for r in con.execute("PRAGMA table_info(practice)").fetchall()]:
        con.execute("ALTER TABLE practice ADD COLUMN scheme INTEGER NOT NULL DEFAULT 0")
    # ma trận số câu theo dạng × mức độ: mặc định của lớp và riêng từng học sinh (JSON, NULL = chưa đặt)
    for tbl in ("classes", "users"):
        if "level_matrix" not in [r[1] for r in con.execute(f"PRAGMA table_info({tbl})").fetchall()]:
            con.execute(f"ALTER TABLE {tbl} ADD COLUMN level_matrix TEXT")
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
