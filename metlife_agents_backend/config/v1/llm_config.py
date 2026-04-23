"""
Azure OpenAI LLM configuration.

Provides a factory for the AzureChatOpenAI instance
used by A3, A5, and A9 agent nodes.
"""

from __future__ import annotations

import logging
from typing import Optional

from config.v1 import BaseSettingsWrapper

logger = logging.getLogger(__name__)


class AzureOpenAIConfig(BaseSettingsWrapper):
    """Environment-driven Azure OpenAI settings."""

    AZURE_OPENAI_API_KEY: Optional[str] = None
    AZURE_OPENAI_ENDPOINT: Optional[str] = None
    AZURE_OPENAI_API_VERSION: str = "2025-04-01-preview"
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-5"
    # 0 = deterministic-ish runs for A3/A5/etc.; override in .env if your deployment rejects 0.
    AZURE_OPENAI_TEMPERATURE: float = 0.0

    def is_configured(self) -> bool:
        return bool(self.AZURE_OPENAI_API_KEY and self.AZURE_OPENAI_ENDPOINT)


azure_openai_config = AzureOpenAIConfig()


def get_llm():
    """Return an AzureChatOpenAI instance or None if not configured.

    When Azure credentials are missing the graph runs in
    rule-based / fallback mode with no LLM calls.
    """
    if not azure_openai_config.is_configured():
        logger.warning(
            "Azure OpenAI not configured — agents will run in fallback mode. "
            "Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env"
        )
        return None

    try:
        from langchain_openai import AzureChatOpenAI

        return AzureChatOpenAI(
            azure_endpoint=azure_openai_config.AZURE_OPENAI_ENDPOINT,
            api_key=azure_openai_config.AZURE_OPENAI_API_KEY,
            api_version=azure_openai_config.AZURE_OPENAI_API_VERSION,
            azure_deployment=azure_openai_config.AZURE_OPENAI_DEPLOYMENT,
            temperature=azure_openai_config.AZURE_OPENAI_TEMPERATURE,
            max_tokens=2048,
        )
    except ImportError:
        logger.error("langchain-openai not installed. pip install langchain-openai")
        return None
