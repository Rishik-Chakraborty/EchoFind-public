from pydantic import BaseModel
from typing import List

from typing import List, Optional

class UploadResponse(BaseModel):
    job_id: int
    status: str

class ChunkUploadResponse(BaseModel):
    status: str
    message: str

class CompleteUploadResponse(BaseModel):
    job_id: int
    status: str

class SearchRequest(BaseModel):
    text: str
    file_id: Optional[int] = None

class SearchResult(BaseModel):
    file_id: int
    filename: str
    start_time: float
    end_time: float
    resolution_type: str
    score: float
