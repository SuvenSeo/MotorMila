FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Scraping is owned by GitHub Actions in production. Keep the API container
# from starting a second in-process scheduler unless explicitly overridden.
ENV DAILY_SYNC_ENABLED=false
# Production schema changes are applied by the GitHub Actions maintenance
# workflow. Avoid blocking API startup on remote DDL locks or pooler latency.
ENV SKIP_DB_INIT=true
# Consumer self-serve signup (7-day Pro trial, email-verified). Dealer/admin
# seats stay invite-only. Requires RESEND_API_KEY (or SMTP_*) and a persistent
# account store (private R2_ACCOUNTS_BUCKET or /data) — see db/account_store.py.
# Override with an HF Space variable SELF_SIGNUP=false to close it again.
ENV SELF_SIGNUP=true

WORKDIR /app

# Create a non-root user and group
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -m -s /bin/bash appuser

COPY requirements.txt ./requirements.txt
# The API server imports the playwright PACKAGE (via the scheduler chain) but
# never launches a browser — scraping runs in GitHub Actions, which installs
# its own Chromium. So we install the pip package (fast, keeps imports working)
# but NOT the ~150MB Chromium browser + system deps, cutting the image build
# from ~40 min to ~2 min on HF's cpu-basic tier. If you ever enable the
# in-container scheduler (DAILY_SYNC_ENABLED, discouraged), add back:
#   && playwright install --with-deps chromium
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Change ownership of /app to appuser
RUN chown -R appuser:appgroup /app

USER appuser

COPY --chown=appuser:appgroup . .

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request, os; port = os.environ.get('PORT', '7860'); urllib.request.urlopen(f'http://localhost:{port}/health')" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
