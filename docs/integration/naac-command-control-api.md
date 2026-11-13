# NAAC Command Control External API

**Version:** 1.0.0
**Base URL:** `https://api.naac.gov.ng/api/integration/v1`
**Authentication:** Bearer Token (Opaque API Key)
**Rate Limit:** 100 requests/minute per integration
**Content-Type:** `application/json`

---

## Overview

The NAAC Command Control External API provides secure, audited access to visitor management data for authorized external systems. All endpoints enforce strict field-level permissions, comprehensive audit logging, and rate limiting.

### Key Features

- **Opaque API Key Authentication** with SHA-256 hash verification (256-bit entropy)
- **Scope-based Authorization** (visitors:read, visits:read, departments:read, visitor_phone:read)
- **Fixed-window Rate Limiting** (100 req/min) with atomic PostgreSQL RPC
- **Comprehensive Audit Logging** for all requests (success, failures, rate limits)
- **Field-level Data Protection** — sensitive fields never exposed
- **Cache-Control: no-store** on all responses
- **Cursor-based Pagination** with exact total counts

---

## Authentication

### API Key Format

```
naac_live_<64_lowercase_hex_characters>
```

The token is a 256-bit cryptographically random value (32 bytes from `crypto.randomBytes(32)`), displayed **once only** at creation. The server stores only the SHA-256 hash of the token.

### Making Authenticated Requests

```bash
curl -H "Authorization: Bearer naac_live_..." \
     -H "Accept: application/json" \
     https://api.naac.gov.ng/api/integration/v1/visitors
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 401 | UNAUTHORIZED | Missing, invalid, expired, or revoked token |
| 403 | INSUFFICIENT_SCOPE | Token lacks required scope for endpoint |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit exceeded (see Retry-After header) |

All error responses include `Cache-Control: no-store`.

---

## Rate Limiting

- **Limit:** 100 requests per minute per integration key
- **Window:** Fixed 60-second windows
- **Headers:**
  - `X-RateLimit-Limit`: 100
  - `X-RateLimit-Remaining`: requests remaining in window
  - `X-RateLimit-Reset`: Unix timestamp of window reset
  - `Retry-After`: seconds until next window (on 429)

Rate limiting is enforced via atomic PostgreSQL RPC `api_integration_rate_limit_increment` — fail-closed on database errors.

---

## Audit Logging

Every request is logged to `api_integration_audit_log` with:

- Integration key ID and name
- Endpoint and HTTP method
- Request ID (for tracing)
- Response status code
- Outcome: `success`, `auth_failure`, `rate_limited`, `client_error`, `server_error`
- Response time (ms)
- Result count (for list endpoints)
- **Never logs bearer tokens**

---

## Endpoints

### 1. List Visitors

```
GET /visitors
```

**Required Scope:** `visitors:read`
**Phone Scope:** `visitor_phone:read` (optional, for phone field)

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Items per page, max 100 (default: 20) |
| search | string | No | Search full_name, visitor_organization, phone |
| from | date (ISO 8601) | No | Filter: created_at >= from |
| to | date (ISO 8601) | No | Filter: created_at <= to |
| phone | string | No | Filter by phone (requires visitor_phone:read) |

#### Response (200)

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "full_name": "John Doe",
      "visitor_organization": "Test Corp",
      "phone": "+2348012345678",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

**Field Notes:**
- `phone` is `null` unless `visitor_phone:read` scope is granted
- Sensitive fields **never included**: `photo_url`, `nationality`, `gender`, `email`, `visitor_address`, `emergency_contact`, `doc_type`, `doc_number`, `issuing_country`, `expiry_date`, `doc_front_url`, `doc_back_url`, `qr_code`, `qr_token`

#### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_PARAMETER | Invalid date format, from > to |
| 403 | INSUFFICIENT_SCOPE | Phone filter used without visitor_phone:read |
| 401 | UNAUTHORIZED | Auth failures |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit hit |

---

### 2. Get Visitor Details

```
GET /visitors/{id}
```

**Required Scope:** `visitors:read`
**Phone Scope:** `visitor_phone:read` (optional, for phone field)

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Visitor ID |

#### Response (200)

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "full_name": "John Doe",
    "visitor_organization": "Test Corp",
    "phone": "+2348012345678",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "visits": [
      {
        "id": "uuid",
        "purpose": "Business meeting",
        "status": "approved",
        "scheduled_date": "2026-01-15T10:00:00Z",
        "check_in_time": "2026-01-15T10:05:00Z",
        "check_out_time": "2026-01-15T12:00:00Z",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "badges": [
          {
            "badge_number": "BADGE-001",
            "badge_status": "Active"
          }
        ]
      }
    ]
  }
}
```

**Field Notes:**
- `phone` is `null` unless `visitor_phone:read` scope is granted
- `visits` array includes all visits for this visitor
- Each visit includes a `badges` array (multiple badges per visit supported)
- `badge_status` is an enum: `Pending`, `Active`, `Returned`, `Expired`, `Cancelled`, `Lost`, `Damaged`, `Revoked`

#### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_PARAMETER | Invalid UUID format |
| 404 | NOT_FOUND | Visitor not found |
| 401 | UNAUTHORIZED | Auth failures |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit hit |

---

### 3. List Visits

```
GET /visits
```

**Required Scope:** `visits:read`

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Items per page, max 100 (default: 20) |
| status | string | No | Filter: pending, approved, checked_in, checked_out, rejected |
| visit_date | date (ISO 8601) | No | Filter by scheduled_date (date only) |
| from | date (ISO 8601) | No | Filter: scheduled_date >= from |
| to | date (ISO 8601) | No | Filter: scheduled_date <= to |

#### Response (200)

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "visitor_id": "uuid",
      "visitor_name": "John Doe",
      "visitor_organization": "Test Corp",
      "purpose": "Business meeting",
      "status": "approved",
      "scheduled_date": "2026-01-15T10:00:00Z",
      "check_in_time": "2026-01-15T10:05:00Z",
      "check_out_time": "2026-01-15T12:00:00Z",
      "host_employee_id": "uuid",
      "host_name": "Jane Smith",
      "host_department": "Operations",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z",
      "badges": [
        {
          "badge_number": "BADGE-001",
          "badge_status": "Active"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "total_pages": 3
  }
}
```

**Field Notes:**
- Each visit includes a `badges` array (multiple badges per visit supported)
- `badge_status` is an enum: `Pending`, `Active`, `Returned`, `Expired`, `Cancelled`, `Lost`, `Damaged`, `Revoked`
- `host_employee_id`, `host_name`, `host_department` may be `null` if host not assigned

#### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_PARAMETER | Invalid date format, from > to, invalid status |
| 401 | UNAUTHORIZED | Auth failures |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit hit |

---

### 4. List Departments

```
GET /departments
```

**Required Scope:** `departments:read`

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Items per page, max 100 (default: 20) |
| search | string | No | Search department name |

#### Response (200)

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Operations",
      "description": "Core operations department",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "total_pages": 1
  }
}
```

#### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_PARAMETER | Invalid page/limit |
| 401 | UNAUTHORIZED | Auth failures |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit hit |

---

## Client SDK Examples

### TypeScript / JavaScript

```typescript
class NAACApiClient {
  constructor(private baseUrl: string, private token: string) {}

  async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json',
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '60';
      throw new Error(`Rate limited. Retry after ${retryAfter}s`);
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`${error.error.code}: ${error.error.message}`);
    }

    return response.json();
  }

  visitors(params?: { page?: number; limit?: number; search?: string; from?: string; to?: string }) {
    return this.request('/visitors', params);
  }

  visitor(id: string) {
    return this.request(`/visitors/${id}`);
  }

  visits(params?: { page?: number; limit?: number; status?: string; visit_date?: string }) {
    return this.request('/visits', params);
  }

  departments(params?: { page?: number; limit?: number; search?: string }) {
    return this.request('/departments', params);
  }
}

// Usage
const client = new NAACApiClient(
  'https://api.naac.gov.ng/api/integration/v1',
  process.env.NAAC_API_TOKEN!
);

const visitors = await client.visitors({ page: 1, limit: 20 });
```

### Python

```python
import requests
from typing import Optional, Dict, Any

class NAACApiClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip('/')
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json',
        }

    def _request(self, path: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        response = requests.get(url, headers=self.headers, params=params, timeout=30)

        if response.status_code == 429:
            retry_after = response.headers.get('Retry-After', '60')
            raise Exception(f"Rate limited. Retry after {retry_after}s")

        response.raise_for_status()
        return response.json()

    def visitors(self, **params) -> Dict[str, Any]:
        return self._request('/visitors', params)

    def visitor(self, id: str) -> Dict[str, Any]:
        return self._request(f'/visitors/{id}')

    def visits(self, **params) -> Dict[str, Any]:
        return self._request('/visits', params)

    def departments(self, **params) -> Dict[str, Any]:
        return self._request('/departments', params)

# Usage
client = NAACApiClient(
    'https://api.naac.gov.ng/api/integration/v1',
    os.environ['NAAC_API_TOKEN']
)

visitors = client.visitors(page=1, limit=20)
```

---

## Token Management

### Issuing Tokens

Use the provided script:

```bash
npx tsx scripts/issue-api-token.mts \
  --name "External CRM" \
  --scopes "visitors:read,visits:read,departments:read" \
  --expires-days 365
```

Output (token shown **once only**):
```
Integration created: ext_crm_abc123
API Key: naac_live_a1b2c3d4e5f6... (64 hex characters)
Key ID: <uuid>
Expires: 2027-11-12T00:00:00Z
```

### Revoking Tokens

```bash
npx tsx scripts/revoke-api-token.mts --id <uuid>
```

---

## Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Missing/invalid/expired/revoked/inactive token |
| INSUFFICIENT_SCOPE | 403 | Token lacks required scope |
| INVALID_PARAMETER | 400 | Invalid query parameter (date, UUID, etc.) |
| NOT_FOUND | 404 | Resource not found |
| RATE_LIMIT_EXCEEDED | 429 | Rate limit exceeded |
| INTERNAL_ERROR | 500 | Server error (logged, contact support) |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-11-12 | Initial release |

---

## Support

- **Email:** api-support@naac.gov.ng
- **Documentation:** https://api.naac.gov.ng/docs
- **Status Page:** https://status.naac.gov.ng