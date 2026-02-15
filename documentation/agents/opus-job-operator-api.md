# Opus Job Operator API - Agent Runbook

## Base setup
- Base URL: `https://operator.opus.com`
- Auth header (required on Opus API endpoints): `x-service-key: <your_service_key>`
- Content type for JSON requests: `Content-Type: application/json`

Important: Uploading to the presigned URL is an S3 request and does **not** use `x-service-key`.

## End-to-end execution flow
1. Get workflow schema: `GET /workflow/{workflowId}`
2. Initiate job: `POST /job/initiate`
3. If file inputs exist:
- Create upload URL(s): `POST /job/file/upload` (one call per file)
- Upload file bytes: `PUT {presignedUrl}`
4. Execute job with populated payload: `POST /job/execute`
5. Poll status: `GET /job/{jobExecutionId}/status`
6. Fetch outputs on completion: `GET /job/{jobExecutionId}/results`
7. Optional trace/debug: `GET /job/{jobExecutionId}/audit`

## Endpoint reference

### 1) Get Workflow Details
- Method/Path: `GET /workflow/{workflowId}`
- Purpose: Get required input schema (`jobPayloadSchema`) for a workflow.

Path params:
- `workflowId` (string, required)

Headers:
- `x-service-key` (string, required)

Response highlights:
- `jobPayloadSchema` (object)
- Input field properties include:
- `id` (string)
- `variable_name` (string)
- `display_name` (string)
- `type` (string): `str`, `float`, `bool`, `date`, `file`, `array`, `array_files`, `object`
- `is_nullable` (boolean)
- `tags` (array, may include file type metadata)

### 2) Initiate Job
- Method/Path: `POST /job/initiate`
- Purpose: Create a job instance and get `jobExecutionId`.

Headers:
- `x-service-key` (string, required)
- `Content-Type: application/json`

Body params:
- `workflowId` (string, required)
- `title` (string, required)
- `description` (string, required)

Response highlights:
- `jobExecutionId` (string, required)

### 3) Get Upload URL
- Method/Path: `POST /job/file/upload`
- Purpose: Get presigned upload URL and final file URL for workflow inputs.

Headers:
- `x-service-key` (string, required)
- `Content-Type: application/json`

Body params:
- `fileExtension` (string, required), include dot, e.g. `.pdf`
- `accessScope` (string, required): `all`, `user`, `workspace`, `organization`

Response highlights:
- `presignedUrl` (string, required)
- `fileUrl` (string, required) - use this in `jobPayloadSchemaInstance`

Supported file extensions (from docs):
- `.pdf`, `.docx`, `.csv`, `.xls`, `.xlsx`, `.txt`, `.json`, `.html`, `.xml`, `.jpeg`, `.jpg`, `.png`

### 4) Upload File
- Method/Path: `PUT {presignedUrl}`
- Purpose: Upload raw file bytes to storage.

Headers:
- `Content-Type` (required), matching file MIME type

Body:
- raw binary bytes

Response:
- HTTP 200 with empty body

Notes:
- This request goes to AWS S3.
- Do not send `x-service-key` here.

### 5) Execute Job
- Method/Path: `POST /job/execute`
- Purpose: Run workflow with populated inputs.

Headers:
- `x-service-key` (string, required)
- `Content-Type: application/json`

Body params:
- `jobExecutionId` (string, required)
- `jobPayloadSchemaInstance` (object, required)

`jobPayloadSchemaInstance` format:
- Key: workflow input variable name from `jobPayloadSchema`
- Value: variable object with:
- `value` (required)
- `type` (required; one of `str`, `float`, `bool`, `date`, `file`, `array`, `array_files`, `object`)
- `displayName` (optional but recommended by docs to avoid UI display glitches)

Response highlights:
- `success` (boolean)
- `message` (string)
- `jobExecutionId` (string)
- `jobPayloadSchemaInstance` (echo)

### 6) Get Job Execution Status
- Method/Path: `GET /job/{jobExecutionId}/status`
- Purpose: Poll progress.

Path params:
- `jobExecutionId` (string, required)

Headers:
- `x-service-key` (string, required)

Response highlights:
- `status` (string)

Status values:
- `IN PROGRESS`
- `COMPLETED`
- `FAILED`

### 7) Get Job Execution Results
- Method/Path: `GET /job/{jobExecutionId}/results`
- Purpose: Retrieve outputs after completion.

Path params:
- `jobExecutionId` (string, required)

Headers:
- `x-service-key` (string, required)

Response highlights:
- `jobExecutionId` (string)
- `status` (string)
- `results` (object), commonly including:
- `summary`
- `outputFiles` (array of URLs)
- `data` (object with output key/value pairs)

### 8) Job Audit Log
- Method/Path: `GET /job/{jobExecutionId}/audit`
- Purpose: Retrieve execution trail for debugging/audit.

Path params:
- `jobExecutionId` (string, required)

Headers:
- `x-service-key` (string, required)

Response highlights:
- `jobExecutionId` (string)
- `auditTrail` (array)
- Audit entry fields include `timestamp`, `actor`, `action`

## Payload templates

### A) Initiate job
```json
{
  "workflowId": "B9uGJfZ3CFwOdMKH",
  "title": "Q4 Report Processing",
  "description": "Processing quarterly financial reports"
}
```

### B) Execute job (no files)
```json
{
  "jobExecutionId": "<JOB_EXECUTION_ID>",
  "jobPayloadSchemaInstance": {
    "workflow_input_example_text": {
      "value": "Summarize this document",
      "type": "str",
      "displayName": "Prompt"
    },
    "workflow_input_threshold": {
      "value": 0.8,
      "type": "float",
      "displayName": "Confidence Threshold"
    }
  }
}
```

### C) Execute job (single file)
```json
{
  "jobExecutionId": "<JOB_EXECUTION_ID>",
  "jobPayloadSchemaInstance": {
    "workflow_input_document": {
      "value": "<FILE_URL_FROM_GET_UPLOAD_URL>",
      "type": "file",
      "displayName": "Document"
    }
  }
}
```

### D) Execute job (multiple files)
```json
{
  "jobExecutionId": "<JOB_EXECUTION_ID>",
  "jobPayloadSchemaInstance": {
    "workflow_input_documents": {
      "value": [
        "<FILE_URL_1>",
        "<FILE_URL_2>"
      ],
      "type": "array_files",
      "displayName": "Documents"
    }
  }
}
```

## Agent implementation rules
- Always fetch `jobPayloadSchema` right before execution logic; do not hardcode variable names.
- Treat variable names in schema as source of truth.
- For each `file` input, upload one file and pass resulting `fileUrl`.
- For each `array_files` input, upload N files and pass array of resulting `fileUrl`s.
- Poll status with retry/backoff until terminal state (`COMPLETED` or `FAILED`).
- Only call results endpoint after `COMPLETED`.
- On failure, fetch audit log for traceability.

## Minimal curl sequence

```bash
# 1) Get schema
curl --request GET \
  --url "https://operator.opus.com/workflow/$WORKFLOW_ID" \
  --header "x-service-key: $SERVICE_KEY"

# 2) Initiate job
curl --request POST \
  --url "https://operator.opus.com/job/initiate" \
  --header "Content-Type: application/json" \
  --header "x-service-key: $SERVICE_KEY" \
  --data '{
    "workflowId": "'$WORKFLOW_ID'",
    "title": "Agent Run",
    "description": "Automated execution"
  }'

# 3) Execute job (replace payload with your schema variables)
curl --request POST \
  --url "https://operator.opus.com/job/execute" \
  --header "Content-Type: application/json" \
  --header "x-service-key: $SERVICE_KEY" \
  --data '{
    "jobExecutionId": "'$JOB_EXECUTION_ID'",
    "jobPayloadSchemaInstance": {
      "workflow_input_example": {
        "value": "hello",
        "type": "str",
        "displayName": "Example"
      }
    }
  }'

# 4) Poll status
curl --request GET \
  --url "https://operator.opus.com/job/$JOB_EXECUTION_ID/status" \
  --header "x-service-key: $SERVICE_KEY"

# 5) Get results
curl --request GET \
  --url "https://operator.opus.com/job/$JOB_EXECUTION_ID/results" \
  --header "x-service-key: $SERVICE_KEY"
```
