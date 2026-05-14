"""Vision analysis pipeline — analyze image style for animation reference."""

from __future__ import annotations

import base64

from openai import AsyncOpenAI

from .models import VisionLlmConfig

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
    api_key = llm_config.api_key
    if not api_key:
        return "未配置视觉模型 API Key。"

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=llm_config.base_url or None,
    )

    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    mime_type = content_type or "image/png"

    response = await client.chat.completions.create(
        model=llm_config.model or "gpt-4o",
        messages=[
            {"role": "system", "content": VISION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "分析这张图片的动画风格参考。"},
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
        max_tokens=1000,
        temperature=0.3,
    )

    return response.choices[0].message.content or "无法分析图片。"
