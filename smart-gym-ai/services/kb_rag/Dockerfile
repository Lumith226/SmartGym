FROM python:3.12-slim
WORKDIR /app
COPY requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY . .
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 8010
CMD ["python", "-m", "uvicorn", "kb_service.app:app", "--host", "0.0.0.0", "--port", "8010"]
