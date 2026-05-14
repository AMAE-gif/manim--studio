"""Vision analysis pipeline — analyze image style for animation reference."""

from __future__ import annotations

import base64

from .models import VisionLlmConfig


async def _vision_llm_call(
    system_prompt: str,
    user_text: str,
    image_bytes: bytes,
    content_type: str,
    llm_config: VisionLlmConfig,
    max_tokens: int = 1500,
    temperature: float = 0.1,
) -> str:
    """Unified vision LLM call supporting both OpenAI and Anthropic formats."""
    import asyncio

    api_key = llm_config.api_key
    base_url = llm_config.base_url
    model = llm_config.model or "gpt-4o"
    api_format = llm_config.api_format or "openai"

    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    mime_type = content_type or "image/png"

    if api_format == "anthropic":
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=api_key, base_url=base_url or None)
        response = await asyncio.wait_for(
            client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_text},
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": mime_type,
                                    "data": b64_image,
                                },
                            },
                        ],
                    }
                ],
                temperature=temperature,
            ),
            timeout=30.0,
        )
        # Skip ThinkingBlock, find first TextBlock
        for block in response.content:
            if hasattr(block, "text"):
                return block.text
        return str(response.content[0]) if response.content else ""
    else:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key, base_url=base_url or None, timeout=30.0)
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_text},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{b64_image}",
                                    "detail": "high",
                                },
                            },
                        ],
                    },
                ],
                max_tokens=max_tokens,
                temperature=temperature,
            ),
            timeout=30.0,
        )
        return response.choices[0].message.content or ""


VISION_SYSTEM_PROMPT = """分析这张图片/帧的动画风格参考。提取以下信息：

1. **色彩方案**：列出主要颜色的 hex 色值（5-8 个颜色）
2. **氛围/风格**：描述整体感觉（如"现代简约"、"活力动感"、"暗色专业"）
3. **字体风格**：如果可见文字，描述字体风格（无衬线、衬线、粗体、细体等）
4. **动画风格建议**：基于视觉效果，推荐动画方式：
   - 转场类型（平滑、弹性、弹性等）
   - 运动感（线性、缓动、弹跳）
   - 复杂度（简约、适中、丰富）
5. **背景风格**：描述背景处理（纯色、渐变、深色、浅色）
6. **视觉元素**：注意任何显著的设计模式（圆角、阴影、发光效果等）

输出为清晰的结构化文本描述。请具体到颜色（hex 色值）和风格。"""


async def analyze_image_style(
    image_bytes: bytes,
    content_type: str,
    llm_config: VisionLlmConfig,
) -> str:
    if not llm_config.api_key:
        return "未配置视觉模型 API Key。"

    try:
        return await _vision_llm_call(
            system_prompt=VISION_SYSTEM_PROMPT,
            user_text="分析这张图片的动画风格参考。",
            image_bytes=image_bytes,
            content_type=content_type,
            llm_config=llm_config,
            max_tokens=1000,
            temperature=0.3,
        )
    except Exception as e:
        return f"视觉模型调用失败: {e}"


MATH_PROBLEM_PROMPT = """你是一个数学问题识别专家。仔细分析这张图片，提取其中的数学问题。

请输出以下内容（使用精确的 JSON 格式）：

{
  "problem_text": "完整的题目文字描述",
  "expressions": ["数学表达式1", "数学表达式2"],
  "problem_type": "方程求解|几何证明|函数分析|数列|概率|...",
  "difficulty": "easy|medium|hard",
  "visual_elements": ["题目中提到的图形元素，如坐标系、圆、三角形等"]
}

注意：
1. 尽量保持原题的数学符号和表达式
2. 如果有图形，描述图形中的关键信息
3. 不要解题，只提取题目
"""


async def extract_math_problem(
    image_bytes: bytes,
    content_type: str,
    llm_config: VisionLlmConfig,
) -> dict:
    import json as _json

    if not llm_config.api_key:
        return {"error": "未配置视觉模型 API Key。"}

    try:
        raw = await _vision_llm_call(
            system_prompt=MATH_PROBLEM_PROMPT,
            user_text="提取这张图片中的数学题目。",
            image_bytes=image_bytes,
            content_type=content_type,
            llm_config=llm_config,
            max_tokens=1500,
            temperature=0.1,
        )
    except Exception as e:
        return {"error": f"视觉模型调用失败: {e}"}
    # Strip markdown fences if present
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
    text = text.strip()

    try:
        return _json.loads(text)
    except _json.JSONDecodeError:
        # Try to extract JSON from the response (LLM may add extra text)
        import re
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            try:
                return _json.loads(json_match.group())
            except _json.JSONDecodeError:
                pass
        return {
            "problem_text": raw,
            "expressions": [],
            "problem_type": "unknown",
            "difficulty": "medium",
            "visual_elements": [],
        }
