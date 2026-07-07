"""
WhatsApp integration — sends approval requests and messages to the PO.
Uses Meta's WhatsApp Business API (or Twilio as fallback).
"""

import os
import httpx
import logging
from models.approval import ApprovalRequest

logger = logging.getLogger(__name__)


class WhatsAppClient:
    def __init__(
        self,
        phone_number_id: str | None = None,
        access_token: str | None = None,
        recipient_number: str | None = None,
    ):
        self.phone_number_id = phone_number_id or os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
        self.access_token = access_token or os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
        self.recipient = recipient_number or os.environ.get("WHATSAPP_RECIPIENT_NUMBER", "")
        self.api_url = f"https://graph.facebook.com/v19.0/{self.phone_number_id}/messages"

        if not all([self.phone_number_id, self.access_token, self.recipient]):
            logger.warning("[WhatsApp] Incomplete config. Set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_RECIPIENT_NUMBER.")

    async def send_message(self, text: str):
        """Send a plain text WhatsApp message to the PO."""
        if not all([self.phone_number_id, self.access_token, self.recipient]):
            logger.warning("[WhatsApp] Skipping message — credentials not configured.")
            return

        payload = {
            "messaging_product": "whatsapp",
            "to": self.recipient,
            "type": "text",
            "text": {"body": text},
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    self.api_url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()
                logger.info("[WhatsApp] Message sent.")
        except Exception as e:
            logger.error(f"[WhatsApp] Send failed: {e}")

    async def send_approval_request(self, approval: ApprovalRequest):
        """Send the approval request message to the PO."""
        await self.send_message(approval.message)
