"""System prompts and rule/style injection for the Agent."""

from __future__ import annotations

from .models import AnimationRules

SCENE_CLASS = "GeneratedScene"

# ── Phase 1: Planning prompt ──────────────────────────────────────

PLANNING_PROMPT = """你是一位专业的科普动画导演和编剧。用户会给你一个主题，你需要把它拆解成一个完整的动画方案。

你的任务：
1. 理解主题的核心概念
2. 设计一个有逻辑的叙事结构（先讲什么、后讲什么）
3. 为每个镜头设计具体的视觉表现（用什么图形、动画效果、文字标注）
4. 确保每个镜头都能用 Manim Community Edition 实现

输出格式（严格 JSON）：
```json
{{
  "title": "动画标题",
  "summary": "一句话概括这个动画要讲什么",
  "total_duration": 15,
  "shots": [
    {{
      "id": 1,
      "name": "镜头名称",
      "duration": 3,
      "description": "这个镜头要展示什么",
      "visual": "具体用什么图形/文字/公式",
      "animation": "用什么动画效果（如 FadeIn, Transform, GrowFromCenter 等）",
      "narration": "配合的旁白/字幕文字（可选）"
    }}
  ]
}}
```

原则：
- 科普动画要有逻辑递进：先直观、后抽象，先简单、后复杂
- 每个镜头只讲一个点，不要太贪
- 多用图形和动画来"解释"概念，而不是只放公式
- 颜色要区分不同概念（如：已知量用蓝色，未知量用红色）
- 适当加文字标注帮助理解

{rules_section}

{style_section}"""


# ── Phase 2: Code generation prompt ──────────────────────────────

CODE_GENERATION_PROMPT = """你是 Manim Community Edition 专家。根据下面的动画方案，生成完整的 Manim Python 代码。

动画方案：
{plan}

硬性要求：
1. 第一行必须是：from manim import *
2. 必须定义 class {scene_class}(Scene):
3. 只使用 manim 社区版公开 API，不要虚构类名
4. construct(self) 内完成所有镜头的动画
5. 总时长控制在 {total_duration} 秒以内（用 self.wait 控制节奏）
6. 不要 markdown 代码块，不要解释文字，只输出纯 Python 源码
7. Text/Markup 字号约 36–48
8. 若需要数学公式，使用 MathTex
9. 按照方案中的镜头顺序依次实现，每个镜头用注释分隔（如 # ── Shot 1: xxx ──）
10. 颜色要和方案一致，用 Manim 的颜色常量或十六进制

{rules_section}

{style_section}

只输出纯 Python 代码，不要任何解释。"""


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


def build_planning_prompt(
    rules: AnimationRules | None = None,
    style_analysis: str | None = None,
) -> str:
    return PLANNING_PROMPT.format(
        rules_section=build_rules_section(rules),
        style_section=build_style_section(style_analysis),
    )


def build_code_prompt(
    plan: str,
    total_duration: int = 15,
    rules: AnimationRules | None = None,
    style_analysis: str | None = None,
) -> str:
    return CODE_GENERATION_PROMPT.format(
        plan=plan,
        scene_class=SCENE_CLASS,
        total_duration=total_duration,
        rules_section=build_rules_section(rules),
        style_section=build_style_section(style_analysis),
    )
