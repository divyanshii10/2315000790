# Campus Notification Platform - Architectural Overview

## Phase 1: API & Real-time Integration
**Core Endpoints:**
- **GET `/api/notifications/inbox`**
  - **Headers:** `Authorization: Bearer <JWT_TOKEN>`
  - **Query Parameters:** `?filter=unread&limit=20&page=1`
  - **Response (200):**
    ```json
    {
      "data": [
        { "notifId": "uuid-v4", "category": "Placement", "body": "...", "readStatus": false, "timestamp": "2026-06-10T10:00:00Z" }
      ],
      "meta": { "totalRecords": 5, "currentPage": 1, "nextPage": null }
    }
    ```
- **PUT `/api/notifications/:notifId/status`**
  - **Headers:** `Authorization: Bearer <JWT_TOKEN>`
  - **Payload:** `{ "readStatus": true }`
  - **Response (200):** `{ "message": "Updated successfully" }`

**Real-time Delivery Choice:**
Server-Sent Events (SSE) is the most optimal choice for broadcasting notifications. Unlike WebSockets, SSE operates over standard HTTP, making it simpler to load balance and proxy, while providing a unidirectional, continuous stream of updates from the server directly to the student's device.

## Phase 2: Database Schema & Scaling
**Storage Strategy:**
I suggest PostgreSQL for its robust JSONB support and reliable indexing.
```sql
CREATE TABLE user_notifications (
    notif_id UUID PRIMARY KEY,
    student_id VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL, -- 'Placement', 'Event', 'Result'
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Crucial index for fast unread fetches
CREATE INDEX idx_unread_per_student ON user_notifications(student_id) WHERE is_read = false;
```
**Handling Scale (Volume Issues):**
- **Issue:** Millions of rows will degrade read/write speeds and cause massive disk I/O.
- **Mitigation Strategy:** Implement table partitioning based on the `created_at` timestamp (e.g., monthly partitions). Additionally, establish a data lifecycle policy to archive or delete notifications older than 90 days.

## Phase 3: Query Profiling
**Analyzing the Slow Query:**
`SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false`
- **Root Cause:** The database engine is scanning millions of rows sequentially because there is no targeted index supporting this exact lookup.
- **Why indexing every column is a bad idea:** Adding widespread indexes heavily penalizes write operations (`INSERT`, `UPDATE`). Every time a notification is created or read, all associated indexes must be recalculated, wasting CPU and storage.

**Optimized 7-Day Placement Query:**
```sql
SELECT DISTINCT student_id 
FROM user_notifications 
WHERE category = 'Placement' 
  AND created_at >= NOW() - INTERVAL '7 days';
```

## Phase 4: Overwhelmed Database on Page Loads
- **The Problem:** 50,000 students refreshing their pages constantly creates a localized DDoS attack on the database.
- **Proposed Solutions:**
  1. **Distributed Caching (Redis):** Keep a cache of the top 20 unread notifications per active student. 
     * *Pros:* Near-instant read times.
     * *Cons:* Cache invalidation logic can get complicated when notifications are marked as read.
  2. **Client-Side State Management (Redux/Zustand) + SSE:** Fetch from the DB only once during initial login. Any subsequent updates are pushed via SSE and stored in browser memory.
     * *Pros:* Eliminates redundant API calls during navigation.
     * *Cons:* A hard browser refresh will still trigger an API call.

## Phase 5: Refactoring `notify_all`
- **Flaws in the Pseudocode:** 
  1. It blocks execution synchronously.
  2. If the email API throws an error at student 200, the process crashes, leaving 49,800 students unnotified. 
  3. Re-running the script will send duplicates to the first 199 students.

- **Should DB save and Email be synchronous?** Absolutely not. The system should persist the notification to the database instantly, and queue the heavy lifting (email delivery) for background processing.

**Robust Redesign using a Message Broker:**
```python
def notify_all(student_list, msg_text):
    # 1. Immediate bulk persistence
    insert_multiple_notifications(student_list, msg_text)
    
    # 2. Asynchronous dispatch to a message broker (like RabbitMQ)
    for sid in student_list:
        send_to_queue("dispatch_email_queue", {"id": sid, "msg": msg_text})

# Independent Consumer Worker
def consume_email_queue(job):
    try:
        deliver_email(job.id, job.msg)
    except Exception:
        # Broker automatically handles dead-lettering and retries
        schedule_retry(job)
```

## Phase 6: Priority Inbox Logic
To construct the priority inbox without writing heavy custom SQL logic:
- **Scoring System:** Map categories to numerical values: `Placement: 3`, `Result: 2`, `Event: 1`.
- **Sorting Mechanism:** 
  1. Retrieve all active/unread notifications for the user.
  2. Perform a primary descending sort based on the category score.
  3. If two notifications share the same category score, perform a secondary sort based on the timestamp to ensure the freshest notification appears first.
  4. Truncate the resulting array to keep only the top 10 elements.
- **Performance:** This is extremely efficient because sorting a handful of unread notifications in memory takes a fraction of a millisecond `O(N log N)`, avoiding complex database sorting overhead.
