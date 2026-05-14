"""Pydantic models for Agent workflow."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LlmConfig(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    api_format: str = "openai"  # "openai" or "anthropic"


class VisionLlmConfig(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    api_format: str = "openai"  # "openai" or "anthropic"


class AnimationRules(BaseModel):
    max_duration: int | None = Field(default=None, ge=1, le=60)
    color_palette: str | None = None
    font_size: int | None = Field(default=None, ge=12, le=120)
    transitions: list[str] | None = None
    background: str | None = None
    custom_rules: str | None = None


class AgentGenerateBody(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    llm: LlmConfig | None = None
    style_analysis: str | None = None
    rules: AnimationRules | None = None
    max_retries: int = Field(default=3, ge=1, le=5)


class TeacherModeSubmit(BaseModel):
    prompt: str = ""
    image_base64: str | None = None
    content_type: str = "image/png"
    llm: LlmConfig | None = None
    vision_llm: VisionLlmConfig | None = None
    rules: AnimationRules | None = None
    style_analysis: str | None = None
    session_id: str | None = None
    refinement: str | None = None
    step_index: int | None = None
    phase: str = "direct"  # "direct" (题目→代码,1次调用) | "full" (题目→解题→代码,2次调用)
