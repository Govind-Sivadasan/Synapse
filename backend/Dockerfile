FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data/temp_dicom

EXPOSE 8000 11112

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
