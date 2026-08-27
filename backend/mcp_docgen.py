#!/usr/bin/env python3
"""
MCP Server for Document Generation — generates PDF/DOCX documents from templates.

Usage:
  python3 mcp_docgen.py

Exposes MCP tools:
  - list_templates: List all available document templates
  - get_template: Get details of a specific template
  - generate_document: Generate a PDF or DOCX document

This is a standalone MCP server using stdio transport.
It shares the doc_templates module with the main backend.
"""

import sys
import os
import json
import asyncio
import logging

# Add parent dir to path so we can import doc_templates
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("mcp_docgen")

from doc_templates import TEMPLATES, generate_pdf, generate_docx, get_template_list

# ── MCP Protocol (stdio) ─────────────────────────────────────────────────────

MCP_PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {
    "name": "document-generator",
    "version": "1.0.0",
}

TOOLS = [
    {
        "name": "list_templates",
        "description": "List all available document templates (rental agreement, NDA, will, employment contract, loan agreement, power of attorney, partnership deed, sale deed). Returns template id, name, description, and field count.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_template",
        "description": "Get details of a specific document template including all fields with their labels, types, and placeholders.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "template_id": {"type": "string", "description": "Template ID (e.g. 'rental_agreement', 'nda', 'will')"},
            },
            "required": ["template_id"],
        },
    },
    {
        "name": "generate_document",
        "description": "Generate a PDF or DOCX document from a template. Saves the file to disk and returns the file path. Template IDs: rental_agreement, nda, will, employment_contract, loan_agreement, power_of_attorney, partnership_deed, sale_deed.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "template_id": {"type": "string", "description": "Template ID"},
                "format": {"type": "string", "enum": ["pdf", "docx"], "default": "pdf", "description": "Output format"},
                "data": {"type": "object", "description": "Field values for the template (key-value pairs)"},
                "output_dir": {"type": "string", "default": ".", "description": "Directory to save the generated file"},
            },
            "required": ["template_id", "data"],
        },
    },
    {
        "name": "generate_rental_agreement",
        "description": "Quick helper: generate a rental agreement. Just provide landlord name, tenant name, property address, monthly rent, and city.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "landlord_name": {"type": "string", "description": "Landlord full name"},
                "tenant_name": {"type": "string", "description": "Tenant full name"},
                "property_address": {"type": "string", "description": "Full address of the rental property"},
                "monthly_rent": {"type": "number", "description": "Monthly rent amount"},
                "security_deposit": {"type": "number", "description": "Security deposit amount"},
                "lease_start": {"type": "string", "description": "Lease start date (YYYY-MM-DD)"},
                "lease_end": {"type": "string", "description": "Lease end date (YYYY-MM-DD)"},
                "city": {"type": "string", "description": "City for jurisdiction"},
                "format": {"type": "string", "enum": ["pdf", "docx"], "default": "pdf"},
                "output_dir": {"type": "string", "default": "."},
            },
            "required": ["landlord_name", "tenant_name", "property_address", "monthly_rent", "city"],
        },
    },
]


async def handle_request(request: dict) -> dict:
    """Handle a single MCP JSON-RPC request."""
    method = request.get("method", "")
    req_id = request.get("id")
    params = request.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "serverInfo": SERVER_INFO,
                "capabilities": {"tools": {}},
            },
        }

    elif method == "notifications/initialized":
        return None  # no response for notifications

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": TOOLS},
        }

    elif method == "tools/call":
        tool_name = params.get("name", "")
        args = params.get("arguments", {})

        if tool_name == "list_templates":
            templates = get_template_list()
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {"type": "text", "text": json.dumps(templates, indent=2)}
                    ],
                },
            }

        elif tool_name == "get_template":
            template_id = args.get("template_id", "")
            if template_id not in TEMPLATES:
                return _error_response(req_id, f"Template '{template_id}' not found. Available: {list(TEMPLATES.keys())}")
            t = TEMPLATES[template_id]
            result = {"id": template_id, "name": t["name"], "description": t["description"], "fields": t["fields"]}
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]},
            }

        elif tool_name == "generate_document":
            template_id = args.get("template_id", "")
            fmt = args.get("format", "pdf")
            data = args.get("data", {})
            output_dir = args.get("output_dir", ".")

            if template_id not in TEMPLATES:
                return _error_response(req_id, f"Template '{template_id}' not found. Available: {list(TEMPLATES.keys())}")

            template = TEMPLATES[template_id]

            # Validate required fields
            for f in template["fields"]:
                if f.get("required") and not data.get(f["key"]):
                    return _error_response(req_id, f"Missing required field: {f['label']} (key: {f['key']})")

            try:
                if fmt == "pdf":
                    content = generate_pdf(template_id, data)
                    ext = "pdf"
                else:
                    content = generate_docx(template_id, data)
                    ext = "docx"

                filename = f"{template['name'].replace(' ', '_')}.{ext}"
                filepath = os.path.join(output_dir, filename)
                with open(filepath, "wb") as f_out:
                    f_out.write(content)

                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "content": [
                            {"type": "text", "text": f"Document generated: {filepath} ({len(content)} bytes)"}
                        ],
                    },
                }
            except Exception as e:
                return _error_response(req_id, f"Generation failed: {str(e)}")

        elif tool_name == "generate_rental_agreement":
            # Quick helper with flat params
            data = {
                "landlord_name": args.get("landlord_name", ""),
                "landlord_address": args.get("landlord_address", ""),
                "tenant_name": args.get("tenant_name", ""),
                "tenant_address": args.get("tenant_address", ""),
                "property_address": args.get("property_address", ""),
                "monthly_rent": str(args.get("monthly_rent", 0)),
                "security_deposit": str(args.get("security_deposit", 0)),
                "lease_start": args.get("lease_start", ""),
                "lease_end": args.get("lease_end", ""),
                "city": args.get("city", ""),
            }
            fmt = args.get("format", "pdf")
            output_dir = args.get("output_dir", ".")

            try:
                if fmt == "pdf":
                    content = generate_pdf("rental_agreement", data)
                    ext = "pdf"
                else:
                    content = generate_docx("rental_agreement", data)
                    ext = "docx"

                filename = f"Rental_Agreement.{ext}"
                filepath = os.path.join(output_dir, filename)
                with open(filepath, "wb") as f_out:
                    f_out.write(content)

                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "content": [
                            {"type": "text", "text": f"Rental agreement generated: {filepath} ({len(content)} bytes)"}
                        ],
                    },
                }
            except Exception as e:
                return _error_response(req_id, f"Generation failed: {str(e)}")

        else:
            return _error_response(req_id, f"Unknown tool: {tool_name}")

    elif method == "ping":
        return {"jsonrpc": "2.0", "id": req_id, "result": {}}

    else:
        return _error_response(req_id, f"Unknown method: {method}")


def _error_response(req_id, message: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32603, "message": message},
    }


async def main():
    """Main loop: read JSON-RPC requests from stdin, write responses to stdout."""
    logger.info("MCP Document Generator server started (stdio transport)")

    while True:
        try:
            line = await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)
            if not line:
                break

            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                continue

            response = await handle_request(request)
            if response is not None:
                sys.stdout.write(json.dumps(response) + "\n")
                sys.stdout.flush()

        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error(f"Error handling request: {e}")


if __name__ == "__main__":
    asyncio.run(main())