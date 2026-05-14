"""System prompts and rule/style injection for the Agent."""

from __future__ import annotations

from .models import AnimationRules

SCENE_CLASS = "GeneratedScene"

AGENT_SYSTEM_PROMPT = """你是 Manim Community Edition 专家和动画规划师。用户用自然语言描述动画，你需要：

1. 思考动画结构：哪些对象、什么转场、什么时序
2. 生成完整可运行的 Python Manim 代码

硬性要求：
1. 第一行必须是：from manim import *
2. 必须定义 class {scene_class}(Scene):
3. 只使用 manim 社区版公开 API，不要虚构类名
4. construct(self) 内完成动画；总时长尽量控制在 15 秒以内（用 self.wait 控制）
5. 不要 markdown 代码块，不要解释文字，只输出纯 Python 源码
6. 使用较快的默认：简单图形、Text/Markup 时注意字号适中（约 36–48）
7. 若需要数学公式，优先使用 MathTex 或 Tex，避免不存在的 LaTeX 包

{rules_section}

{style_section}

请先思考动画结构，然后生成代码。考虑动画结构、时序、颜色和转场效果。""".format(
    scene_class=SCENE_CLASS,
    rules_section="",
    style_section="",
)


def build_rules_section(rules: AnimationRules | None) -> str:
    if not rules:
        return ""

    lines = ["动画规范（用户自定义约束）："]
    if rules.max_duration:
        lines.append(f"- 最大时长：{rules.max_duration} 秒")
    if rules.color_palette:
        lines.append(f"- 颜色方案：仅使用以下颜色：{rules.color_palette}")
    if rules.font_size:
        lines.append(f"- 字体大小：{rules.font_size}")
    if rules.transitions:
        lines.append(f"- 允许的转场效果：{', '.join(rules.transitions)}")
    if rules.background:
        lines.append(f"- 背景：{rules.background}")
    if rules.custom_rules:
        lines.append(f"- 额外规则：{rules.custom_rules}")

    return "\n".join(lines)


def build_style_section(style_analysis: str | None) -> str:
    if not style_analysis:
        return ""
    return f"""风格参考（从用户上传的图片/视频中分析）：
{style_analysis}

请将此风格应用到动画中：匹配颜色、氛围、字体和视觉感受。"""


def build_system_prompt(
    rules: AnimationRules | None = None,
    style_analysis: str | None = None,
) -> str:
    return AGENT_SYSTEM_PROMPT.format(
        rules_section=build_rules_section(rules),
        style_section=build_style_section(style_analysis),
    )
