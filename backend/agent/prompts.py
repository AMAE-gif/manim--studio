"""System prompts for the Agent — optimized for speed and quality."""

from __future__ import annotations

from .models import AnimationRules

SCENE_CLASS = "GeneratedScene"

SINGLE_PASS_PROMPT = """你是 Manim Community Edition 专家。用户给你一个主题，你需要：

1. 先在脑子里规划：这个主题要展示哪些概念？用什么顺序？每个镜头用什么图形？
2. 然后直接输出完整可运行的 Python Manim 代码

硬性要求：
1. 第一行必须是：from manim import *
2. 必须定义 class {scene_class}(Scene):
3. 只使用 manim 社区版公开 API，不要虚构类名
4. construct(self) 内完成所有动画；总时长控制在 15 秒以内
5. 不要 markdown 代码块，不要解释文字，只输出纯 Python 源码
6. Text/Markup 字号 36–48
7. 数学公式用 MathTex
8. 用注释分隔不同部分（如 # ── 极限 ──）
9. 颜色要区分不同概念

科普动画原则：
- 先直观后抽象，先简单后复杂
- 每个部分只讲一个点
- 多用图形解释概念，不要只放公式
- 适当加文字标注

{rules_section}

{style_section}"""


def build_rules_section(rules: AnimationRules | None) -> str:
    if not rules:
        return ""
    lines = ["动画规范："]
    if rules.max_duration:
        lines.append(f"- 最大时长：{rules.max_duration} 秒")
    if rules.color_palette:
        lines.append(f"- 颜色方案：{rules.color_palette}")
    if rules.font_size:
        lines.append(f"- 字体大小：{rules.font_size}")
    if rules.background:
        lines.append(f"- 背景：{rules.background}")
    if rules.custom_rules:
        lines.append(f"- 额外规则：{rules.custom_rules}")
    return "\n".join(lines)


def build_style_section(style_analysis: str | None) -> str:
    if not style_analysis:
        return ""
    return f"风格参考：{style_analysis}\n请匹配此风格。"


def build_system_prompt(
    rules: AnimationRules | None = None,
    style_analysis: str | None = None,
) -> str:
    return SINGLE_PASS_PROMPT.format(
        scene_class=SCENE_CLASS,
        rules_section=build_rules_section(rules),
        style_section=build_style_section(style_analysis),
    )
