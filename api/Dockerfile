FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt requirements-ai.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Transformer encoder for dense retrieval; build with --build-arg WITH_DENSE=0 to skip
ARG WITH_DENSE=1
RUN if [ "$WITH_DENSE" = "1" ]; then pip install --no-cache-dir -r requirements-ai.txt; fi
COPY app ./app
COPY scripts ./scripts
COPY tests ./tests
RUN mkdir -p eval
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
