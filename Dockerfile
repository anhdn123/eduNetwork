# Đóng gói Learning by AI để chạy trên Fly.io (hoặc bất kỳ nơi nào chạy Docker). Chỉ dùng thư viện chuẩn của Python.
FROM python:3.12-slim
WORKDIR /app
COPY server ./server
COPY public ./public
ENV PYTHONUNBUFFERED=1 \
    LBAI_HOST=0.0.0.0 \
    LBAI_PORT=8080 \
    LBAI_DATA=/data \
    LBAI_NO_BROWSER=1 \
    LBAI_QUIET=1 \
    LBAI_COOKIE_SECURE=1 \
    LBAI_TRUST_PROXY=1
EXPOSE 8080
CMD ["python", "-m", "server"]
