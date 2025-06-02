# Digital Ocean PDF Processing Service Implementation Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Digital Ocean Infrastructure Setup](#digital-ocean-infrastructure-setup)
3. [PDF Processing Service Implementation](#pdf-processing-service-implementation)
4. [API Specification](#api-specification)
5. [Vercel Integration](#vercel-integration)
6. [Security & Authentication](#security--authentication)
7. [Monitoring & Logging](#monitoring--logging)
8. [Error Handling & Resilience](#error-handling--resilience)
9. [Testing Strategy](#testing-strategy)
10. [Deployment Pipeline](#deployment-pipeline)
11. [Scaling & Performance](#scaling--performance)
12. [Cost Optimization](#cost-optimization)
13. [Complete Implementation Todo List](#complete-implementation-todo-list)

---

## Architecture Overview

### Current State
- **Vercel**: Hosts Next.js application with serverless functions
- **Issue**: PDF-to-image processing requires Python libraries unavailable in Vercel serverless environment
- **Result**: 30-second timeouts and processing failures

### Target Architecture
```
┌─────────────────┐    HTTP API    ┌──────────────────────┐
│   Vercel App    │ ──────────────▶ │  Digital Ocean       │
│                 │                 │  PDF Service         │
│ - Next.js UI    │ ◀────────────── │                      │
│ - Job Management│     Response    │ - Python Libraries   │
│ - Database      │                 │ - PDF Processing     │
│ - Auth          │                 │ - Image Generation   │
└─────────────────┘                 └──────────────────────┘
```

### Service Responsibilities

#### Vercel App (Unchanged)
- User interface and authentication
- Job creation and status management
- Database operations (Supabase)
- Real-time dashboard updates
- Final result compilation

#### Digital Ocean PDF Service (New)
- PDF text extraction
- PDF-to-image conversion
- Vision model processing
- Image optimization
- Health monitoring
- Performance metrics

---

## Digital Ocean Infrastructure Setup

### 1. App Platform Configuration

#### Service Specification (`app.yaml`)
```yaml
name: roofing-pdf-processor
services:
- name: pdf-service
  source_dir: /
  github:
    repo: your-org/roofing-pdf-service
    branch: main
  run_command: gunicorn --bind 0.0.0.0:8080 --workers 2 --timeout 300 app:app
  environment_slug: python
  instance_count: 1
  instance_size_slug: basic-xxs
  http_port: 8080
  health_check:
    http_path: /health
    initial_delay_seconds: 30
    period_seconds: 10
    timeout_seconds: 5
    failure_threshold: 3
    success_threshold: 2
  env:
  - key: FLASK_ENV
    value: production
  - key: ANTHROPIC_API_KEY
    scope: RUN_TIME
    type: SECRET
  - key: OPENAI_API_KEY
    scope: RUN_TIME
    type: SECRET
  - key: API_SECRET_KEY
    scope: RUN_TIME
    type: SECRET
  - key: ALLOWED_ORIGINS
    value: "https://your-vercel-app.vercel.app,https://your-domain.com"
```

### 2. Resource Requirements

#### Instance Sizing Guide
```yaml
Development:
  instance_size_slug: basic-xxs
  instance_count: 1
  cost: ~$5/month

Production:
  instance_size_slug: basic-xs
  instance_count: 2
  cost: ~$24/month

High Volume:
  instance_size_slug: basic-s
  instance_count: 3-5
  cost: ~$60-100/month
```

### 3. Domain and SSL
```yaml
domains:
- name: pdf-processor.yourdomain.com
  type: PRIMARY
  wildcard: false
```

---

## PDF Processing Service Implementation

### 1. Project Structure
```
roofing-pdf-service/
├── app.py                  # Flask application entry point
├── requirements.txt        # Python dependencies
├── Dockerfile             # Container configuration
├── app.yaml               # Digital Ocean config
├── .env.example           # Environment variables template
├── src/
│   ├── __init__.py
│   ├── pdf_processor.py   # Core PDF processing logic
│   ├── image_converter.py # PDF-to-image conversion
│   ├── vision_processor.py # AI vision processing
│   ├── auth.py           # API authentication
│   ├── utils.py          # Utility functions
│   └── models.py         # Data models/schemas
├── tests/
│   ├── __init__.py
│   ├── test_pdf_processor.py
│   ├── test_image_converter.py
│   ├── test_auth.py
│   └── fixtures/
│       ├── sample_estimate.pdf
│       └── sample_roof_report.pdf
├── scripts/
│   ├── deploy.sh         # Deployment script
│   └── health_check.sh   # Health monitoring
└── docs/
    ├── api.md            # API documentation
    └── deployment.md     # Deployment guide
```

### 2. Core Dependencies (`requirements.txt`)
```txt
# Web Framework
Flask==2.3.3
gunicorn==21.2.0
Flask-CORS==4.0.0

# PDF Processing
PyPDF2==3.0.1
pdfplumber==0.9.0
pdf2image==1.16.3
Pillow==10.0.1

# System Dependencies (handled by Dockerfile)
poppler-utils  # For pdf2image

# AI/ML Libraries
openai==0.28.1
anthropic==0.7.7
requests==2.31.0

# Utilities
python-dotenv==1.0.0
jsonschema==4.19.2
python-multipart==0.0.6

# Monitoring & Logging
structlog==23.2.0
prometheus-client==0.18.0

# Development
pytest==7.4.3
pytest-cov==4.1.0
black==23.9.1
flake8==6.1.0
```

### 3. Dockerfile
```dockerfile
FROM python:3.11-slim

# Install system dependencies for PDF processing
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start application
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "300", "app:app"]
```

### 4. Main Application (`app.py`)
```python
import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from src.pdf_processor import PDFProcessor
from src.image_converter import ImageConverter
from src.vision_processor import VisionProcessor
from src.auth import require_api_key, validate_request
from src.utils import setup_logging, handle_error
import structlog

# Configure structured logging
setup_logging()
logger = structlog.get_logger()

app = Flask(__name__)

# CORS configuration
CORS(app, origins=os.getenv('ALLOWED_ORIGINS', '').split(','))

# Initialize processors
pdf_processor = PDFProcessor()
image_converter = ImageConverter()
vision_processor = VisionProcessor()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for Digital Ocean monitoring"""
    try:
        # Quick system checks
        checks = {
            'pdf_processor': pdf_processor.is_healthy(),
            'vision_processor': vision_processor.is_healthy(),
            'disk_space': check_disk_space(),
            'memory_usage': check_memory_usage()
        }
        
        if all(checks.values()):
            return jsonify({
                'status': 'healthy',
                'checks': checks,
                'version': os.getenv('APP_VERSION', '1.0.0')
            }), 200
        else:
            return jsonify({
                'status': 'unhealthy',
                'checks': checks
            }), 503
            
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/process-pdf', methods=['POST'])
@require_api_key
@validate_request
def process_pdf():
    """
    Main PDF processing endpoint
    
    Expected payload:
    {
        "job_id": "uuid",
        "pdf_type": "estimate" | "roof_report",
        "processing_options": {
            "extract_text": true,
            "generate_images": true,
            "use_vision": true,
            "image_quality": "high" | "medium" | "low"
        }
    }
    
    Files: 'pdf_file' (multipart/form-data)
    """
    try:
        # Extract request data
        job_id = request.form.get('job_id')
        pdf_type = request.form.get('pdf_type', 'estimate')
        processing_options = request.get_json().get('processing_options', {})
        
        if 'pdf_file' not in request.files:
            return jsonify({'error': 'No PDF file provided'}), 400
            
        pdf_file = request.files['pdf_file']
        
        logger.info("Processing PDF started", 
                   job_id=job_id, 
                   pdf_type=pdf_type,
                   file_size=len(pdf_file.read()))
        pdf_file.seek(0)  # Reset file pointer
        
        # Process PDF
        result = process_pdf_file(pdf_file, job_id, pdf_type, processing_options)
        
        logger.info("PDF processing completed", 
                   job_id=job_id,
                   result_keys=list(result.keys()))
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error("PDF processing failed", 
                    job_id=job_id, 
                    error=str(e),
                    exc_info=True)
        return handle_error(e), 500

@app.route('/api/extract-fields', methods=['POST'])
@require_api_key
@validate_request
def extract_fields():
    """
    Field extraction endpoint using AI
    
    Expected payload:
    {
        "job_id": "uuid",
        "text_content": "extracted pdf text...",
        "images": ["base64_image1", "base64_image2"],
        "field_configs": {...},
        "extraction_strategy": "text_only" | "vision_only" | "hybrid"
    }
    """
    try:
        data = request.get_json()
        job_id = data.get('job_id')
        
        logger.info("Field extraction started", job_id=job_id)
        
        # Process field extraction
        result = vision_processor.extract_fields(
            text_content=data.get('text_content'),
            images=data.get('images', []),
            field_configs=data.get('field_configs'),
            strategy=data.get('extraction_strategy', 'hybrid')
        )
        
        logger.info("Field extraction completed", 
                   job_id=job_id,
                   fields_extracted=len(result.get('fields', {})))
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error("Field extraction failed", 
                    job_id=job_id, 
                    error=str(e),
                    exc_info=True)
        return handle_error(e), 500

@app.route('/api/metrics', methods=['GET'])
@require_api_key
def get_metrics():
    """Prometheus-style metrics endpoint"""
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}

def process_pdf_file(pdf_file, job_id, pdf_type, options):
    """Core PDF processing logic"""
    result = {
        'job_id': job_id,
        'pdf_type': pdf_type,
        'text_content': None,
        'images': [],
        'metadata': {},
        'processing_time_ms': 0,
        'errors': [],
        'warnings': []
    }
    
    start_time = time.time()
    
    try:
        # 1. Extract text
        if options.get('extract_text', True):
            logger.info("Starting text extraction", job_id=job_id)
            result['text_content'] = pdf_processor.extract_text(pdf_file.read())
            result['metadata']['text_length'] = len(result['text_content'])
            pdf_file.seek(0)  # Reset for next operation
        
        # 2. Generate images
        if options.get('generate_images', True):
            logger.info("Starting image generation", job_id=job_id)
            images = image_converter.pdf_to_images(
                pdf_file.read(),
                quality=options.get('image_quality', 'medium')
            )
            result['images'] = images
            result['metadata']['image_count'] = len(images)
            pdf_file.seek(0)
        
        # 3. Extract metadata
        result['metadata'].update(pdf_processor.extract_metadata(pdf_file.read()))
        
    except Exception as e:
        result['errors'].append(str(e))
        logger.error("Error in PDF processing", job_id=job_id, error=str(e))
    
    result['processing_time_ms'] = int((time.time() - start_time) * 1000)
    return result

def check_disk_space():
    """Check available disk space"""
    import shutil
    total, used, free = shutil.disk_usage("/")
    return free / total > 0.1  # More than 10% free

def check_memory_usage():
    """Check memory usage"""
    import psutil
    return psutil.virtual_memory().percent < 90  # Less than 90% used

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=False)
```

---

## API Specification

### Authentication
All endpoints require an API key in the `X-API-Key` header.

### Endpoints

#### `POST /api/process-pdf`
Process a PDF file and extract text/images.

**Request:**
```http
POST /api/process-pdf
Content-Type: multipart/form-data
X-API-Key: your-secret-key

job_id=uuid-here
pdf_type=estimate
pdf_file=@path/to/file.pdf
processing_options={"extract_text": true, "generate_images": true}
```

**Response:**
```json
{
  "job_id": "uuid-here",
  "pdf_type": "estimate",
  "text_content": "extracted text...",
  "images": ["base64-encoded-image1", "base64-encoded-image2"],
  "metadata": {
    "text_length": 1542,
    "image_count": 3,
    "page_count": 3,
    "file_size": 245760
  },
  "processing_time_ms": 2340,
  "errors": [],
  "warnings": []
}
```

#### `POST /api/extract-fields`
Extract specific fields using AI vision/text processing.

**Request:**
```json
{
  "job_id": "uuid-here",
  "text_content": "extracted pdf text...",
  "images": ["base64-image1", "base64-image2"],
  "field_configs": {
    "property_address": {
      "prompt": "Extract the property address...",
      "model": "gpt-4-vision-preview"
    }
  },
  "extraction_strategy": "hybrid"
}
```

**Response:**
```json
{
  "job_id": "uuid-here",
  "fields": {
    "property_address": {
      "value": "123 Main St, Anytown, USA",
      "confidence": 0.95,
      "source": "vision",
      "extraction_method": "gpt-4-vision"
    }
  },
  "processing_time_ms": 1240,
  "strategy_used": "hybrid",
  "errors": [],
  "warnings": []
}
```

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "pdf_processor": true,
    "vision_processor": true,
    "disk_space": true,
    "memory_usage": true
  },
  "version": "1.0.0"
}
```

---

## Vercel Integration

### 1. Environment Variables (Vercel)
Add to your Vercel project settings:

```env
PDF_SERVICE_URL=https://pdf-processor.yourdomain.com
PDF_SERVICE_API_KEY=your-secret-api-key-here
PDF_SERVICE_TIMEOUT=300000
```

### 2. Modified Agent Implementation

#### Updated `EstimateExtractorAgent.ts`
```typescript
// Replace the vision processing section with API call
if (shouldUseVision) {
  try {
    console.log(`[${jobId}] Calling Digital Ocean PDF service for vision processing`);
    
    const pdfServiceResult = await this.callPDFService(input.pdfBuffer, jobId, 'estimate');
    
    if (pdfServiceResult.images && pdfServiceResult.images.length > 0) {
      visionResults = await this.processImagesWithAI(
        pdfServiceResult.images,
        context
      );
    }
  } catch (error) {
    this.log(LogLevel.WARN, 'pdf-service-error', `PDF service call failed: ${error.message}`);
  }
}

private async callPDFService(pdfBuffer: Buffer, jobId: string, pdfType: string) {
  const formData = new FormData();
  formData.append('pdf_file', new Blob([pdfBuffer]), 'document.pdf');
  formData.append('job_id', jobId);
  formData.append('pdf_type', pdfType);
  formData.append('processing_options', JSON.stringify({
    extract_text: true,
    generate_images: true,
    use_vision: true,
    image_quality: 'medium'
  }));

  const response = await fetch(process.env.PDF_SERVICE_URL + '/api/process-pdf', {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.PDF_SERVICE_API_KEY!
    },
    body: formData,
    timeout: parseInt(process.env.PDF_SERVICE_TIMEOUT || '300000')
  });

  if (!response.ok) {
    throw new Error(`PDF service error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}
```

### 3. Error Handling & Fallbacks
```typescript
// In your agent, add fallback logic
try {
  // Try Digital Ocean service first
  const result = await this.callPDFService(pdfBuffer, jobId, 'estimate');
  return result;
} catch (serviceError) {
  this.log(LogLevel.WARN, 'pdf-service-fallback', 'Falling back to text-only processing');
  
  // Fallback to existing text-only processing
  return await this.processTextOnly(pdfBuffer, context);
}
```

---

## Security & Authentication

### 1. API Key Management
```python
# src/auth.py
import os
import functools
from flask import request, jsonify
import hashlib
import hmac

API_KEYS = {
    'vercel_app': os.getenv('VERCEL_API_KEY'),
    'admin': os.getenv('ADMIN_API_KEY')
}

def require_api_key(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        
        if not api_key:
            return jsonify({'error': 'API key required'}), 401
        
        if api_key not in API_KEYS.values():
            return jsonify({'error': 'Invalid API key'}), 403
        
        # Add API key info to request context
        request.api_key_type = get_key_type(api_key)
        
        return f(*args, **kwargs)
    return decorated_function

def validate_request(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        # Validate request size
        if request.content_length and request.content_length > 50 * 1024 * 1024:  # 50MB
            return jsonify({'error': 'File too large'}), 413
        
        # Validate content type for PDF uploads
        if 'pdf_file' in request.files:
            file = request.files['pdf_file']
            if not file.mimetype == 'application/pdf':
                return jsonify({'error': 'Invalid file type'}), 400
        
        return f(*args, **kwargs)
    return decorated_function
```

### 2. Rate Limiting
```python
# Add to app.py
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

@app.route('/api/process-pdf', methods=['POST'])
@limiter.limit("10 per minute")
@require_api_key
def process_pdf():
    # ... existing code
```

### 3. CORS Configuration
```python
# Restrictive CORS for production
CORS(app, 
     origins=['https://your-vercel-app.vercel.app', 'https://yourdomain.com'],
     methods=['POST', 'GET'],
     allow_headers=['Content-Type', 'X-API-Key'])
```

---

## Monitoring & Logging

### 1. Structured Logging Setup
```python
# src/utils.py
import structlog
import logging
import sys

def setup_logging():
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )
```

### 2. Metrics Collection
```python
# src/metrics.py
from prometheus_client import Counter, Histogram, Gauge
import time

# Metrics
pdf_processing_requests = Counter('pdf_processing_requests_total', 'Total PDF processing requests', ['pdf_type', 'status'])
pdf_processing_duration = Histogram('pdf_processing_duration_seconds', 'PDF processing duration', ['pdf_type'])
active_connections = Gauge('active_connections', 'Active connections')

def track_pdf_processing(pdf_type):
    def decorator(f):
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = f(*args, **kwargs)
                pdf_processing_requests.labels(pdf_type=pdf_type, status='success').inc()
                return result
            except Exception as e:
                pdf_processing_requests.labels(pdf_type=pdf_type, status='error').inc()
                raise
            finally:
                duration = time.time() - start_time
                pdf_processing_duration.labels(pdf_type=pdf_type).observe(duration)
        return wrapper
    return decorator
```

### 3. Digital Ocean Monitoring Integration
```yaml
# app.yaml monitoring section
alerts:
- rule: DEPLOYMENT_FAILED
- rule: DOMAIN_FAILED
- rule: FUNCTIONS_ERROR_RATE_HIGH
  window: FIVE_MINUTES
  threshold: 10
- rule: FUNCTIONS_AVERAGE_RESPONSE_TIME_HIGH
  window: TEN_MINUTES
  threshold: 5000
```

---

## Error Handling & Resilience

### 1. Comprehensive Error Handling
```python
# src/utils.py
import traceback
from flask import jsonify

class PDFProcessingError(Exception):
    def __init__(self, message, error_code=None, details=None):
        self.message = message
        self.error_code = error_code or 'PDF_PROCESSING_ERROR'
        self.details = details or {}
        super().__init__(self.message)

class VisionProcessingError(Exception):
    def __init__(self, message, error_code=None, details=None):
        self.message = message
        self.error_code = error_code or 'VISION_PROCESSING_ERROR'
        self.details = details or {}
        super().__init__(self.message)

def handle_error(error):
    if isinstance(error, (PDFProcessingError, VisionProcessingError)):
        return jsonify({
            'error': error.message,
            'error_code': error.error_code,
            'details': error.details
        }), 400
    
    # Log unexpected errors
    logger.error("Unexpected error", 
                error=str(error),
                traceback=traceback.format_exc())
    
    return jsonify({
        'error': 'Internal server error',
        'error_code': 'INTERNAL_ERROR'
    }), 500
```

### 2. Circuit Breaker Pattern
```python
# src/circuit_breaker.py
import time
from enum import Enum

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitBreaker:
    def __init__(self, failure_threshold=5, timeout=60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitState.CLOSED
    
    def call(self, func, *args, **kwargs):
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.timeout:
                self.state = CircuitState.HALF_OPEN
            else:
                raise Exception("Circuit breaker is OPEN")
        
        try:
            result = func(*args, **kwargs)
            self.on_success()
            return result
        except Exception as e:
            self.on_failure()
            raise
    
    def on_success(self):
        self.failure_count = 0
        self.state = CircuitState.CLOSED
    
    def on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN

# Usage in vision processor
vision_circuit_breaker = CircuitBreaker(failure_threshold=3, timeout=300)

def call_vision_api_with_circuit_breaker(prompt, images):
    return vision_circuit_breaker.call(call_vision_api, prompt, images)
```

### 3. Retry Logic with Exponential Backoff
```python
# src/retry.py
import time
import random
from functools import wraps

def retry_with_backoff(max_retries=3, base_delay=1, max_delay=60, exponential_base=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise
                    
                    delay = min(base_delay * (exponential_base ** attempt), max_delay)
                    jitter = random.uniform(0, 0.1 * delay)
                    time.sleep(delay + jitter)
                    
                    logger.warning(f"Retry attempt {attempt + 1} after error: {e}")
            
        return wrapper
    return decorator
```

---

## Testing Strategy

### 1. Unit Tests
```python
# tests/test_pdf_processor.py
import pytest
from src.pdf_processor import PDFProcessor
from src.image_converter import ImageConverter
import os

class TestPDFProcessor:
    def setup_method(self):
        self.processor = PDFProcessor()
        self.test_pdf_path = 'tests/fixtures/sample_estimate.pdf'
    
    def test_extract_text_success(self):
        with open(self.test_pdf_path, 'rb') as f:
            pdf_content = f.read()
        
        result = self.processor.extract_text(pdf_content)
        
        assert isinstance(result, str)
        assert len(result) > 0
        assert 'estimate' in result.lower() or 'property' in result.lower()
    
    def test_extract_text_invalid_pdf(self):
        invalid_content = b"not a pdf"
        
        with pytest.raises(Exception):
            self.processor.extract_text(invalid_content)
    
    def test_extract_metadata(self):
        with open(self.test_pdf_path, 'rb') as f:
            pdf_content = f.read()
        
        metadata = self.processor.extract_metadata(pdf_content)
        
        assert 'page_count' in metadata
        assert metadata['page_count'] > 0
        assert 'file_size' in metadata

class TestImageConverter:
    def setup_method(self):
        self.converter = ImageConverter()
        self.test_pdf_path = 'tests/fixtures/sample_estimate.pdf'
    
    def test_pdf_to_images_success(self):
        with open(self.test_pdf_path, 'rb') as f:
            pdf_content = f.read()
        
        images = self.converter.pdf_to_images(pdf_content, quality='medium')
        
        assert isinstance(images, list)
        assert len(images) > 0
        assert all(isinstance(img, str) for img in images)  # Base64 strings
    
    def test_pdf_to_images_quality_settings(self):
        with open(self.test_pdf_path, 'rb') as f:
            pdf_content = f.read()
        
        high_quality = self.converter.pdf_to_images(pdf_content, quality='high')
        low_quality = self.converter.pdf_to_images(pdf_content, quality='low')
        
        # High quality should produce larger base64 strings
        assert len(high_quality[0]) > len(low_quality[0])
```

### 2. Integration Tests
```python
# tests/test_api_integration.py
import pytest
import json
from app import app

class TestAPIIntegration:
    def setup_method(self):
        self.app = app.test_client()
        self.api_key = 'test-api-key'
        
    def test_health_endpoint(self):
        response = self.app.get('/health')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'healthy'
    
    def test_process_pdf_success(self):
        with open('tests/fixtures/sample_estimate.pdf', 'rb') as f:
            response = self.app.post('/api/process-pdf',
                data={
                    'job_id': 'test-job-123',
                    'pdf_type': 'estimate',
                    'pdf_file': (f, 'test.pdf')
                },
                headers={'X-API-Key': self.api_key}
            )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['job_id'] == 'test-job-123'
        assert 'text_content' in data
        assert 'images' in data
    
    def test_process_pdf_no_api_key(self):
        response = self.app.post('/api/process-pdf')
        assert response.status_code == 401
    
    def test_process_pdf_invalid_file(self):
        response = self.app.post('/api/process-pdf',
            data={
                'job_id': 'test-job-123',
                'pdf_file': (b'not a pdf', 'test.txt')
            },
            headers={'X-API-Key': self.api_key}
        )
        
        assert response.status_code == 400
```

### 3. Load Testing
```python
# tests/load_test.py
import asyncio
import aiohttp
import time
import statistics

async def load_test():
    concurrent_requests = 10
    total_requests = 100
    
    async with aiohttp.ClientSession() as session:
        start_time = time.time()
        
        # Prepare test data
        with open('tests/fixtures/sample_estimate.pdf', 'rb') as f:
            pdf_content = f.read()
        
        async def make_request(session, request_id):
            data = aiohttp.FormData()
            data.add_field('job_id', f'load-test-{request_id}')
            data.add_field('pdf_type', 'estimate')
            data.add_field('pdf_file', pdf_content, filename='test.pdf')
            
            try:
                async with session.post(
                    'http://localhost:8080/api/process-pdf',
                    data=data,
                    headers={'X-API-Key': 'test-api-key'}
                ) as response:
                    return response.status, await response.text()
            except Exception as e:
                return 500, str(e)
        
        # Run load test
        tasks = []
        for i in range(total_requests):
            task = make_request(session, i)
            tasks.append(task)
            
            # Limit concurrent requests
            if len(tasks) >= concurrent_requests:
                results = await asyncio.gather(*tasks)
                tasks = []
                
                # Process results
                success_count = sum(1 for status, _ in results if status == 200)
                print(f"Batch complete. Success rate: {success_count}/{len(results)}")
        
        # Handle remaining tasks
        if tasks:
            results = await asyncio.gather(*tasks)
            success_count = sum(1 for status, _ in results if status == 200)
            print(f"Final batch. Success rate: {success_count}/{len(results)}")
        
        total_time = time.time() - start_time
        print(f"Load test complete. Total time: {total_time:.2f}s")
        print(f"Requests per second: {total_requests/total_time:.2f}")

if __name__ == '__main__':
    asyncio.run(load_test())
```

---

## Deployment Pipeline

### 1. GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to Digital Ocean

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v3
      with:
        python-version: '3.11'
    
    - name: Install system dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y poppler-utils
    
    - name: Install Python dependencies
      run: |
        pip install -r requirements.txt
        pip install pytest pytest-cov
    
    - name: Run tests
      run: |
        pytest tests/ -v --cov=src --cov-report=xml
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
        flags: unittests

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Install doctl
      uses: digitalocean/action-doctl@v2
      with:
        token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
    
    - name: Deploy to Digital Ocean App Platform
      run: |
        doctl apps create-deployment ${{ secrets.DO_APP_ID }} --wait
        
    - name: Verify deployment
      run: |
        sleep 30
        curl -f https://pdf-processor.yourdomain.com/health || exit 1
    
    - name: Notify team
      if: failure()
      uses: 8398a7/action-slack@v3
      with:
        status: failure
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### 2. Deployment Script
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "🚀 Starting deployment to Digital Ocean..."

# Configuration
APP_ID=${DO_APP_ID}
DOMAIN="pdf-processor.yourdomain.com"

# Pre-deployment checks
echo "🔍 Running pre-deployment checks..."
python -m pytest tests/ -v
python -m flake8 src/
python -m black --check src/

# Build and deploy
echo "📦 Building application..."
docker build -t roofing-pdf-service .

echo "🚢 Deploying to Digital Ocean..."
doctl apps create-deployment $APP_ID --wait

# Post-deployment verification
echo "🔍 Verifying deployment..."
sleep 30

# Health check
if curl -f https://$DOMAIN/health; then
    echo "✅ Deployment successful!"
    echo "🌐 Service available at: https://$DOMAIN"
else
    echo "❌ Deployment verification failed!"
    exit 1
fi

# Update environment variables if needed
if [ -f ".env.production" ]; then
    echo "🔧 Updating environment variables..."
    # doctl apps update $APP_ID --spec app.yaml
fi

echo "🎉 Deployment complete!"
```

### 3. Environment Management
```bash
# Environment setup scripts

# Development
cp .env.example .env.development
echo "PDF_SERVICE_URL=http://localhost:8080" >> .env.development

# Staging
cp .env.example .env.staging
echo "PDF_SERVICE_URL=https://pdf-processor-staging.yourdomain.com" >> .env.staging

# Production
cp .env.example .env.production
echo "PDF_SERVICE_URL=https://pdf-processor.yourdomain.com" >> .env.production
```

---

## Scaling & Performance

### 1. Horizontal Scaling Configuration
```yaml
# app.yaml scaling configuration
services:
- name: pdf-service
  instance_count: 2
  autoscaling:
    min_instance_count: 1
    max_instance_count: 10
    metrics:
    - type: cpu
      target:
        type: Utilization
        averageUtilization: 70
    - type: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 2. Performance Optimization
```python
# src/performance.py
import asyncio
from concurrent.futures import ThreadPoolExecutor
import functools

class PerformanceOptimizer:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=4)
    
    def run_in_thread(self, func):
        """Run CPU-intensive operations in thread pool"""
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                self.executor, 
                functools.partial(func, *args, **kwargs)
            )
        return wrapper

# Usage
optimizer = PerformanceOptimizer()

@optimizer.run_in_thread
def cpu_intensive_pdf_processing(pdf_content):
    # Heavy PDF processing here
    return process_pdf(pdf_content)
```

### 3. Caching Strategy
```python
# src/cache.py
import redis
import json
import hashlib
from functools import wraps

redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    decode_responses=True
)

def cache_result(ttl=3600):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create cache key from function name and args
            cache_key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # Try to get from cache
            cached_result = redis_client.get(cache_key)
            if cached_result:
                return json.loads(cached_result)
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            redis_client.setex(cache_key, ttl, json.dumps(result))
            
            return result
        return wrapper
    return decorator

# Usage
@cache_result(ttl=1800)  # Cache for 30 minutes
def extract_pdf_metadata(pdf_hash):
    # Expensive metadata extraction
    pass
```

---

## Cost Optimization

### 1. Resource Usage Monitoring
```python
# src/cost_monitoring.py
import psutil
import time
from prometheus_client import Gauge

# Metrics for cost tracking
cpu_usage_gauge = Gauge('cpu_usage_percent', 'CPU usage percentage')
memory_usage_gauge = Gauge('memory_usage_percent', 'Memory usage percentage')
disk_usage_gauge = Gauge('disk_usage_percent', 'Disk usage percentage')

def monitor_resources():
    """Monitor resource usage for cost optimization"""
    while True:
        # CPU usage
        cpu_percent = psutil.cpu_percent(interval=1)
        cpu_usage_gauge.set(cpu_percent)
        
        # Memory usage
        memory = psutil.virtual_memory()
        memory_usage_gauge.set(memory.percent)
        
        # Disk usage
        disk = psutil.disk_usage('/')
        disk_percent = (disk.used / disk.total) * 100
        disk_usage_gauge.set(disk_percent)
        
        time.sleep(60)  # Monitor every minute
```

### 2. Cost Estimation Tool
```python
# scripts/cost_estimator.py
def estimate_monthly_cost():
    """Estimate monthly cost based on usage patterns"""
    
    # Digital Ocean App Platform pricing (as of 2024)
    pricing = {
        'basic-xxs': 5,   # $5/month
        'basic-xs': 12,   # $12/month
        'basic-s': 25,    # $25/month
        'basic-m': 50,    # $50/month
    }
    
    # Usage estimates
    avg_requests_per_day = 100
    avg_processing_time_seconds = 30
    peak_concurrent_requests = 5
    
    # Calculate required instance size
    if peak_concurrent_requests <= 2:
        recommended_size = 'basic-xxs'
        instance_count = 1
    elif peak_concurrent_requests <= 5:
        recommended_size = 'basic-xs'
        instance_count = 2
    else:
        recommended_size = 'basic-s'
        instance_count = 3
    
    base_cost = pricing[recommended_size] * instance_count
    
    # Add bandwidth costs (estimated)
    bandwidth_cost = 0.01 * avg_requests_per_day * 30  # ~$0.01 per request
    
    total_monthly_cost = base_cost + bandwidth_cost
    
    print(f"Estimated monthly cost: ${total_monthly_cost:.2f}")
    print(f"Recommended configuration: {instance_count}x {recommended_size}")
    print(f"Base cost: ${base_cost}")
    print(f"Bandwidth cost: ${bandwidth_cost:.2f}")
    
    return total_monthly_cost

if __name__ == '__main__':
    estimate_monthly_cost()
```

---

## Complete Implementation Todo List

### Phase 1: Infrastructure Setup (Week 1)
#### Digital Ocean Setup
- [ ] Create Digital Ocean account and set up billing
- [ ] Generate API tokens and configure CLI tools
- [ ] Set up domain and DNS configuration
- [ ] Configure SSL certificates
- [ ] Set up monitoring and alerting

#### Repository Setup
- [ ] Create new repository for PDF service
- [ ] Set up branch protection rules
- [ ] Configure GitHub Actions secrets
- [ ] Set up code quality tools (Black, Flake8, etc.)
- [ ] Create issue templates and PR templates

#### Development Environment
- [ ] Set up local development environment
- [ ] Install Docker and Docker Compose
- [ ] Create development docker-compose.yml
- [ ] Set up local testing with sample PDFs
- [ ] Configure IDE/editor with Python tools

### Phase 2: Core Implementation (Week 2-3)
#### PDF Processing Service
- [ ] Implement `PDFProcessor` class with text extraction
- [ ] Implement `ImageConverter` class with PDF-to-image conversion
- [ ] Create `VisionProcessor` class for AI integration
- [ ] Implement authentication and authorization
- [ ] Add input validation and sanitization

#### API Development
- [ ] Create Flask application structure
- [ ] Implement `/api/process-pdf` endpoint
- [ ] Implement `/api/extract-fields` endpoint
- [ ] Add health check endpoint
- [ ] Implement proper error handling and responses

#### Testing Framework
- [ ] Set up pytest configuration
- [ ] Create unit tests for PDF processing
- [ ] Create unit tests for image conversion
- [ ] Create integration tests for API endpoints
- [ ] Set up test fixtures with sample PDFs

### Phase 3: Integration (Week 3-4)
#### Vercel Integration
- [ ] Modify `EstimateExtractorAgent.ts` to call PDF service
- [ ] Update `RoofReportExtractorAgent.ts` if needed
- [ ] Add environment variables to Vercel
- [ ] Implement fallback mechanisms
- [ ] Add error handling and retry logic

#### API Client Implementation
- [ ] Create TypeScript client for PDF service
- [ ] Implement request/response types
- [ ] Add timeout and retry configuration
- [ ] Implement circuit breaker pattern
- [ ] Add comprehensive error handling

#### End-to-End Testing
- [ ] Test complete workflow from Vercel to DO
- [ ] Verify PDF processing with real documents
- [ ] Test error scenarios and fallbacks
- [ ] Validate performance under load
- [ ] Test deployment pipeline

### Phase 4: Production Deployment (Week 4-5)
#### Deployment Pipeline
- [ ] Set up GitHub Actions workflow
- [ ] Configure automated testing in CI/CD
- [ ] Set up staging environment
- [ ] Implement blue-green deployment strategy
- [ ] Add rollback procedures

#### Monitoring and Observability
- [ ] Set up structured logging
- [ ] Implement Prometheus metrics
- [ ] Configure Digital Ocean monitoring
- [ ] Set up alerting rules
- [ ] Create monitoring dashboard

#### Security Hardening
- [ ] Implement rate limiting
- [ ] Add request validation
- [ ] Configure CORS properly
- [ ] Set up API key rotation
- [ ] Implement security headers

### Phase 5: Optimization (Week 5-6)
#### Performance Optimization
- [ ] Implement caching strategy
- [ ] Optimize image processing performance
- [ ] Add request queuing for high load
- [ ] Implement connection pooling
- [ ] Add performance monitoring

#### Cost Optimization
- [ ] Implement auto-scaling configuration
- [ ] Add resource usage monitoring
- [ ] Optimize container resource allocation
- [ ] Implement cost alerting
- [ ] Create cost estimation tools

#### Documentation
- [ ] Complete API documentation
- [ ] Create deployment runbook
- [ ] Document monitoring procedures
- [ ] Create troubleshooting guide
- [ ] Add architecture diagrams

### Phase 6: Launch Preparation (Week 6)
#### Pre-Launch Testing
- [ ] Conduct load testing
- [ ] Perform security audit
- [ ] Test disaster recovery procedures
- [ ] Validate monitoring and alerting
- [ ] Review and test all documentation

#### Launch Preparation
- [ ] Prepare rollback plan
- [ ] Set up launch monitoring
- [ ] Configure launch alerts
- [ ] Prepare incident response procedures
- [ ] Schedule launch window

#### Post-Launch Activities
- [ ] Monitor system performance
- [ ] Track error rates and performance metrics
- [ ] Collect user feedback
- [ ] Plan optimization improvements
- [ ] Document lessons learned

### Ongoing Maintenance
#### Weekly Tasks
- [ ] Review system performance metrics
- [ ] Check error logs and alerts
- [ ] Update security patches
- [ ] Review cost optimization opportunities
- [ ] Monitor API usage patterns

#### Monthly Tasks
- [ ] Review and rotate API keys
- [ ] Analyze performance trends
- [ ] Update documentation
- [ ] Review cost reports
- [ ] Plan capacity upgrades if needed

#### Quarterly Tasks
- [ ] Conduct security audit
- [ ] Review disaster recovery procedures
- [ ] Update dependencies
- [ ] Performance benchmark testing
- [ ] Architecture review

---

## Risk Mitigation

### Technical Risks
1. **PDF Processing Failures**: Implement robust fallback to text-only processing
2. **API Rate Limits**: Implement queuing and rate limiting
3. **Resource Exhaustion**: Add monitoring and auto-scaling
4. **Service Downtime**: Implement health checks and auto-restart

### Business Risks
1. **Cost Overruns**: Implement cost monitoring and alerts
2. **Performance Degradation**: Add comprehensive monitoring
3. **Security Vulnerabilities**: Regular security audits and updates
4. **Vendor Lock-in**: Use standard APIs and containerization

### Operational Risks
1. **Deployment Failures**: Automated testing and rollback procedures
2. **Configuration Errors**: Infrastructure as code and validation
3. **Data Loss**: Stateless design with external storage
4. **Team Knowledge**: Comprehensive documentation and training

---

This comprehensive guide provides everything your development team needs to implement the Digital Ocean PDF processing service. The todo list is designed to be followed sequentially, with clear phases and checkpoints for review and validation.