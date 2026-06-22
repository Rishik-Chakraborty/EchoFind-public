from pydantic import BaseModel
from typing import List

class UploadResponse(BaseModel):
    job_id: int
    status: str

class SearchRequest(BaseModel):
    text: str

class SearchResult(BaseModel):
    file_id: int
    start_time: float
    end_time: float
    resolution_type: str
    score: float
