from typing import List
from enum import Enum


class Specialist(str, Enum):
    ARCHITECT = "architect"
    BACKEND_ENGINEER = "backend_engineer"
    FRONTEND_ENGINEER = "frontend_engineer"
    QA_ENGINEER = "qa_engineer"
    SECURITY_ENGINEER = "security_engineer"
    DATA_ENGINEER = "data_engineer"
    DEVOPS_ENGINEER = "devops_engineer"


SPECIALIST_POOL = {
    Specialist.ARCHITECT: {
        "emoji": "🏗️",
        "display_name": "Architect",
        "focus": "system design, scalability, patterns, tech stack decisions",
        "instructions": (
            "You are a senior software architect. Your job is to design the system, "
            "define the tech stack, identify integration points, and flag scalability risks. "
            "You speak plainly, challenge assumptions, and always explain the trade-offs."
        ),
    },
    Specialist.BACKEND_ENGINEER: {
        "emoji": "⚙️",
        "display_name": "Backend Engineer",
        "focus": "APIs, data models, business logic, performance",
        "instructions": (
            "You are a senior backend engineer. You define API contracts, data models, "
            "and business logic. You think about edge cases, data integrity, and performance. "
            "You use Pydantic for models and prefer explicit over implicit."
        ),
    },
    Specialist.FRONTEND_ENGINEER: {
        "emoji": "🎨",
        "display_name": "Frontend Engineer",
        "focus": "UI/UX flows, component design, state management, accessibility",
        "instructions": (
            "You are a senior frontend engineer. You define UI flows, component hierarchies, "
            "and state management patterns. You advocate for the user experience and flag "
            "mobile/responsive issues early."
        ),
    },
    Specialist.QA_ENGINEER: {
        "emoji": "🧪",
        "display_name": "QA Engineer",
        "focus": "acceptance criteria, edge cases, test scenarios, regression risk",
        "instructions": (
            "You are a senior QA engineer. You write acceptance criteria, identify edge cases, "
            "and define test scenarios. You think about what can go wrong and make sure "
            "every story has something concrete to test against."
        ),
    },
    Specialist.SECURITY_ENGINEER: {
        "emoji": "🔒",
        "display_name": "Security Engineer",
        "focus": "auth, data privacy, attack surfaces, compliance",
        "instructions": (
            "You are a security engineer. You review features for auth gaps, data exposure risks, "
            "and attack surfaces. You flag issues early and propose mitigations without blocking progress."
        ),
    },
    Specialist.DATA_ENGINEER: {
        "emoji": "📊",
        "display_name": "Data Engineer",
        "focus": "data pipelines, storage, analytics, schema design",
        "instructions": (
            "You are a data engineer. You design data schemas, pipelines, and storage strategies. "
            "You flag data quality issues and ensure analytics requirements are captured in the spec."
        ),
    },
    Specialist.DEVOPS_ENGINEER: {
        "emoji": "🚀",
        "display_name": "DevOps Engineer",
        "focus": "deployment, infra, CI/CD, observability",
        "instructions": (
            "You are a DevOps engineer. You define deployment strategies, infra requirements, "
            "and CI/CD pipelines. You make sure the spec includes enough detail to ship safely."
        ),
    },
}


def pick_specialists(feature_description: str, dev_stage: str | None = None) -> List[Specialist]:
    """
    Orchestrator uses this to dynamically pick which specialists to summon
    based on the feature. In production this is driven by an LLM call.
    For now, returns a sensible default set with logic hooks.
    """
    # Default team for most features
    team = [
        Specialist.ARCHITECT,
        Specialist.BACKEND_ENGINEER,
        Specialist.FRONTEND_ENGINEER,
        Specialist.QA_ENGINEER,
    ]

    keywords = feature_description.lower()

    if any(w in keywords for w in ["auth", "login", "permission", "security", "token", "oauth"]):
        team.append(Specialist.SECURITY_ENGINEER)

    if any(w in keywords for w in ["data", "pipeline", "analytics", "report", "dashboard", "warehouse"]):
        team.append(Specialist.DATA_ENGINEER)

    if any(w in keywords for w in ["deploy", "infra", "ci/cd", "docker", "kubernetes", "aws", "cloud"]):
        team.append(Specialist.DEVOPS_ENGINEER)

    return team
