import json
import os
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from psycopg2 import pool, sql

# ===========================================================================
# APP
# ===========================================================================

app = Flask(__name__)
CORS(app)

# ===========================================================================
# DATABASE CONNECTION
# ===========================================================================

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "10.10.2.58"),
    "port": int(os.environ.get("DB_PORT", "5432")),
    "dbname": os.environ.get("DB_NAME", "chatbot"),
    "user": os.environ.get("DB_USER", "nishanth"),
    "password": os.environ.get("DB_PASSWORD", "nishanth"),
}

# The schema that holds the usp_* procedures.
DB_SCHEMA = os.environ.get("DB_SCHEMA", "public")

_aihub_db_pool = None


def _get_aihub_db_pool():
    """The pool opens on the first request, not at import time."""
    global _aihub_db_pool
    if _aihub_db_pool is None:
        _aihub_db_pool = pool.ThreadedConnectionPool(1, 20, **DB_CONFIG)
    return _aihub_db_pool


def get_aihubdata_db_connection():
    """A connection whose search_path points at the procedures."""
    conn = _get_aihub_db_pool().getconn()
    cursor = conn.cursor()
    cursor.execute(
        sql.SQL("SET search_path TO {}, public").format(sql.Identifier(DB_SCHEMA))
    )
    cursor.close()
    conn.commit()
    return conn


def release_aihub_db(conn):
    if conn:
        _get_aihub_db_pool().putconn(conn)


# StatusCode from the procedures -> HTTP status
HTTP_STATUS_BY_CODE = {"S001": 200, "S002": 200, "N001": 404, "E001": 409, "IA001": 409, "F001": 400}


def _text(data, key):
    """Trimmed text, or None when empty — so the procedure's IS NULL checks work."""
    value = data.get(key)
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _int(data, key):
    """Whole number, or None when missing / empty / 0 (0 means 'all' on the list calls)."""
    value = data.get(key)
    if value in (None, "", 0, "0"):
        return None
    return int(value)


def _ids_text(value):
    """[3, 7] or "3, 7" -> "3,7" for the comma separated id parameters."""
    if isinstance(value, (list, tuple)):
        value = ",".join(str(v) for v in value)
    return _text({"v": value}, "v")


def _json_text(value):
    """ToolsJSON / AdvancedSettingsJSON as JSON text, or None. Raises ValueError if invalid."""
    if value is None or value == "":
        return None
    if isinstance(value, str):
        json.loads(value)
        return value
    return json.dumps(value)


# ===========================================================================
# 5.1 LANGUAGE
# ===========================================================================

@app.route('/get-language-data', methods=['POST'])
@cross_origin()
def get_language_data():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        custcode = _text(data, 'custcode')
        orgcode = _text(data, 'orgcode')

        if not custcode or not orgcode:
            return jsonify({
                "success": False,
                "message": "Missing required parameters: custcode or orgcode"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        refcursor_name = "language_cursor"

        cursor.execute(
            "CALL usp_get_language_data(%s::varchar, %s::varchar, %s::varchar, %s::boolean, %s)",
            (custcode, orgcode, _text(data, 'languagecode'), data.get('isactive'), refcursor_name)
        )

        cursor.execute(f"FETCH ALL IN {refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute("COMMIT")

        return jsonify({
            "success": True,
            "statuscode": "S001" if results else "N001",
            "count": len(results),
            "results": results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# ===========================================================================
# 5.2 MANAGE AGENT
# ===========================================================================

# Create when agentid is 0, update when it is greater than 0.
@app.route('/save-agent', methods=['POST'])
@cross_origin()
def save_agent():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}

        # Needed for every framework (the procedure checks the per-framework fields).
        required = ["custcode", "orgcode", "agentcode", "agentname", "frameworkcode",
                    "llmprovider", "llmmodelname", "usercode"]
        missing = [key for key in required if not _text(data, key)]
        if data.get('isactive') is None:
            missing.append("isactive")
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        try:
            tools_json = _json_text(data.get('toolsjson'))
            advanced_json = _json_text(data.get('advancedsettingsjson'))
        except ValueError:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": "toolsjson and advancedsettingsjson must be valid JSON"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            """
            CALL usp_save_agent(
                %s::varchar, %s::varchar, %s::varchar, %s::varchar, %s::varchar,
                %s::varchar, %s::varchar, %s::varchar, %s::varchar, %s::text,
                %s::text, %s::varchar, %s::varchar, %s::varchar,
                %s::numeric, %s::int, %s::int, %s::int,
                %s::boolean, %s::boolean, %s::boolean, %s::boolean,
                %s::jsonb, %s::jsonb, %s::boolean, %s::int, %s::varchar,
                %s::int, NULL::varchar
            )
            """,
            (
                _text(data, 'custcode'), _text(data, 'orgcode'), _text(data, 'agentcode'),
                _text(data, 'agentname'), _text(data, 'description'),
                _text(data, 'frameworkcode').upper(), _text(data, 'agenttype'),
                _text(data, 'rolename'), _text(data, 'goal'), _text(data, 'backstory'),
                _text(data, 'instructions'), _text(data, 'expectedoutput'),
                _text(data, 'llmprovider'), _text(data, 'llmmodelname'),
                data.get('temperature'), data.get('maxtokens'),
                data.get('maxiterations'), data.get('maxexecutiontimeseconds'),
                data.get('allowdelegation'), data.get('memoryenabled'),
                data.get('reasoningenabled'), data.get('allowcodeexecution'),
                tools_json, advanced_json,
                data.get('isactive'), data.get('displayorder'), _text(data, 'usercode'),
                int(data.get('agentid') or 0),
            )
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        messages = {
            "S001": "Agent created.",
            "S002": "Agent updated.",
            # The procedure requires Backstory as well as Role Name and Goal.
            "F001": "Role Name, Goal and Backstory are all required.",
            "E001": "An agent with this code already exists.",
        }
        return jsonify({
            "success": status_code in ("S001", "S002"),
            "statuscode": status_code,
            "agentid": output.get('p_agent_id'),
            "agentcode": _text(data, 'agentcode'),
            "message": messages.get(status_code, "Save failed.")
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# One agent (agentid) or a paged list.
@app.route('/get-agent-data', methods=['POST'])
@cross_origin()
def get_agent_data():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        custcode = _text(data, 'custcode')
        orgcode = _text(data, 'orgcode')

        if not custcode or not orgcode:
            return jsonify({
                "success": False,
                "message": "Missing required parameters: custcode or orgcode"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        refcursor_name = "agent_data_cursor"

        cursor.execute(
            """
            CALL usp_get_agent_data(
                %s::varchar, %s::varchar, %s::int, %s::varchar,
                %s::boolean, %s::varchar, %s::int, %s::int, %s
            )
            """,
            (
                custcode, orgcode,
                _int(data, 'agentid'),                                   # 0 / empty = list
                (_text(data, 'frameworkcode') or '').upper() or None,
                data.get('isactive'),
                _text(data, 'searchtext'),
                int(data.get('pageno') or 1), int(data.get('pagesize') or 20),
                refcursor_name,
            )
        )

        cursor.execute(f"FETCH ALL IN {refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute("COMMIT")

        return jsonify({
            "success": True,
            "statuscode": "S001" if results else "N001",
            "count": len(results),
            "totalcount": results[0]['total_count'] if results else 0,
            "results": results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Soft delete; refused (IA001) while a bot still uses the agent.
@app.route('/delete-agent', methods=['POST'])
@cross_origin()
def delete_agent():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        agent_ids = _ids_text(data.get('agentid'))              # comma separated, e.g. "3,7"

        missing = [key for key in ["custcode", "orgcode", "usercode"] if not _text(data, key)]
        if not agent_ids:
            missing.append("agentid")
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            "CALL usp_delete_agent(%s::varchar, %s::varchar, %s::varchar, %s::varchar, NULL::int, NULL::varchar)",
            (_text(data, 'custcode'), _text(data, 'orgcode'), agent_ids, _text(data, 'usercode'))
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        messages = {
            "S001": "Agent deleted.",
            "N001": "No matching agent found.",
            "IA001": "The agent is used by a bot and cannot be deleted. Set it inactive instead.",
        }
        return jsonify({
            "success": status_code == "S001",
            "statuscode": status_code,
            "agentid": agent_ids,
            "deletedcount": output.get('p_deleted_count'),
            "message": messages.get(status_code, "Delete failed.")
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# ===========================================================================
# 5.3 MANAGE BOT
# ===========================================================================

# Create when botid is 0, update when it is greater than 0.
@app.route('/save-bot', methods=['POST'])
@cross_origin()
def save_bot():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        agent_ids = _ids_text(data.get('agentids'))             # comma separated, in run order

        required = ["custcode", "orgcode", "botname", "description", "knowledgebaseid",
                    "defaultlanguagecode", "status", "usercode"]
        missing = [key for key in required if not _text(data, key)]
        if not agent_ids:
            missing.append("agentids")
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            """
            CALL usp_save_bot(
                %s::varchar, %s::varchar, %s::varchar, %s::varchar, %s::int, %s::int,
                %s::varchar, %s::varchar, %s::varchar, %s::varchar, %s::int, %s::varchar,
                %s::int, NULL::varchar, NULL::varchar
            )
            """,
            (
                _text(data, 'custcode'), _text(data, 'orgcode'),
                _text(data, 'botname'), _text(data, 'description'),
                int(data.get('knowledgebaseid')), _int(data, 'guidelineid'),
                _text(data, 'welcomemessage'), _text(data, 'defaultlanguagecode'),
                _text(data, 'status').upper(),                   # DRAFT / ACTIVE / INACTIVE
                agent_ids,
                _int(data, 'maxqueriespersession'),              # NULL -> 20
                _text(data, 'usercode'),
                int(data.get('botid') or 0),
            )
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        return jsonify({
            "success": status_code in ("S001", "S002"),
            "statuscode": status_code,
            "botid": output.get('p_bot_id'),
            "botcode": output.get('p_bot_code')
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# One bot (botid) or a paged list.
@app.route('/get-bot-data', methods=['POST'])
@cross_origin()
def get_bot_data():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        custcode = _text(data, 'custcode')
        orgcode = _text(data, 'orgcode')

        if not custcode or not orgcode:
            return jsonify({
                "success": False,
                "message": "Missing required parameters: custcode or orgcode"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        refcursor_name = "bot_data_cursor"

        cursor.execute(
            """
            CALL usp_get_bot_data(
                %s::varchar, %s::varchar, %s::int, %s::int, %s::int,
                %s::varchar, %s::varchar, %s::int, %s::int, %s
            )
            """,
            (
                custcode, orgcode,
                _int(data, 'botid'), _int(data, 'knowledgebaseid'), _int(data, 'guidelineid'),
                (_text(data, 'status') or '').upper() or None,
                _text(data, 'searchtext'),
                int(data.get('pageno') or 1), int(data.get('pagesize') or 20),
                refcursor_name,
            )
        )

        cursor.execute(f"FETCH ALL IN {refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute("COMMIT")

        return jsonify({
            "success": True,
            "statuscode": "S001" if results else "N001",
            "count": len(results),
            "totalcount": results[0]['total_count'] if results else 0,
            "results": results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Publish / unpublish toggle — only the status changes.
@app.route('/update-bot-status', methods=['POST'])
@cross_origin()
def update_bot_status():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}

        required = ["custcode", "orgcode", "botid", "status", "usercode"]
        missing = [key for key in required if not _text(data, key)]
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        bot_status = _text(data, 'status').upper()

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            "CALL usp_update_bot_status(%s::varchar, %s::varchar, %s::int, %s::varchar, %s::varchar, NULL::varchar)",
            (_text(data, 'custcode'), _text(data, 'orgcode'), int(data.get('botid')),
             bot_status, _text(data, 'usercode'))
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        return jsonify({
            "success": status_code == "S002",
            "statuscode": status_code,
            "botid": int(data.get('botid')),
            "botstatus": bot_status
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Soft delete; refused (IA001) once a bot has conversations.
@app.route('/delete-bot', methods=['POST'])
@cross_origin()
def delete_bot():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        bot_ids = _ids_text(data.get('botid'))                  # comma separated, e.g. "3,7"

        missing = [key for key in ["custcode", "orgcode", "usercode"] if not _text(data, key)]
        if not bot_ids:
            missing.append("botid")
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            "CALL usp_delete_bot(%s::varchar, %s::varchar, %s::varchar, %s::varchar, NULL::int, NULL::varchar)",
            (_text(data, 'custcode'), _text(data, 'orgcode'), bot_ids, _text(data, 'usercode'))
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        messages = {
            "S001": "Bot deleted.",
            "N001": "No matching bot found.",
            "IA001": "The bot has conversations and cannot be deleted.",
        }
        return jsonify({
            "success": status_code == "S001",
            "statuscode": status_code,
            "botid": bot_ids,
            "deletedcount": output.get('p_deleted_count'),
            "message": messages.get(status_code, "Delete failed.")
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# The security gate when the chat opens. Two result sets: the bot, and its agents
# in run order. N001 for a missing bot, an inactive one or an untagged user alike.
@app.route('/get-bot-chat-config', methods=['POST'])
@cross_origin()
def get_bot_chat_config():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}

        required = ["custcode", "orgcode", "botcode", "userid"]
        missing = [key for key in required if not _text(data, key)]
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        bot_refcursor_name = "bot_config_cursor"
        agent_refcursor_name = "bot_agent_cursor"

        cursor.execute(
            """
            CALL usp_get_bot_chat_config(
                %s::varchar, %s::varchar, %s::varchar, %s::int, %s, %s, NULL::varchar
            )
            """,
            (_text(data, 'custcode'), _text(data, 'orgcode'), _text(data, 'botcode'),
             int(data.get('userid')), bot_refcursor_name, agent_refcursor_name)
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}
        status_code = output.get('p_status_code')

        cursor.execute(f"FETCH ALL IN {bot_refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        bot_results = [dict(zip(colnames, r)) for r in rows]

        cursor.execute(f"FETCH ALL IN {agent_refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        agent_results = [dict(zip(colnames, r)) for r in rows]

        cursor.execute("COMMIT")

        if status_code != "S001":
            return jsonify({
                "success": False,
                "statuscode": "N001",
                "message": "Bot not available."
            }), 404

        return jsonify({
            "success": True,
            "statuscode": status_code,
            "bot": bot_results[0] if bot_results else None,
            "agents": agent_results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# ===========================================================================
# 5.4 USER TAGGING
# ===========================================================================

# Saves the whole ticked list for one bot in one call. [] untags everyone.
@app.route('/save-bot-user', methods=['POST'])
@cross_origin()
def save_bot_user():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}

        required = ["custcode", "orgcode", "botid", "usercode"]
        missing = [key for key in required if not _text(data, key)]
        if data.get('userids') is None:
            missing.append("userids")
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        # [12, 15] or "12,15" -> [12, 15]
        raw_ids = data.get('userids')
        if isinstance(raw_ids, str):
            raw_ids = [part for part in raw_ids.split(',') if part.strip()]
        user_ids = [int(u) for u in raw_ids]

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            """
            CALL usp_save_bot_user(
                %s::varchar, %s::varchar, %s::int, %s::int[], %s::varchar,
                NULL::int, NULL::int, NULL::int, NULL::varchar
            )
            """,
            (_text(data, 'custcode'), _text(data, 'orgcode'), int(data.get('botid')),
             user_ids, _text(data, 'usercode'))
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        return jsonify({
            "success": status_code == "S001",
            "statuscode": status_code,
            "botid": int(data.get('botid')),
            "taggedcount": output.get('p_tagged_count'),
            "addedcount": output.get('p_added_count'),
            "removedcount": output.get('p_removed_count')
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Users with an is_tagged flag, for the Tag Users popup.
@app.route('/get-bot-user-data', methods=['POST'])
@cross_origin()
def get_bot_user_data():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}

        required = ["custcode", "orgcode", "botid"]
        missing = [key for key in required if not _text(data, key)]
        if missing:
            return jsonify({
                "success": False,
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        refcursor_name = "bot_user_cursor"

        cursor.execute(
            """
            CALL usp_get_bot_user_data(
                %s::varchar, %s::varchar, %s::int, %s::varchar, %s::boolean, %s::int, %s::int, %s
            )
            """,
            (
                _text(data, 'custcode'), _text(data, 'orgcode'), int(data.get('botid')),
                _text(data, 'searchtext'), bool(data.get('onlytagged')),
                int(data.get('pageno') or 1), int(data.get('pagesize') or 50),
                refcursor_name,
            )
        )

        cursor.execute(f"FETCH ALL IN {refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute("COMMIT")

        return jsonify({
            "success": True,
            "statuscode": "S001" if results else "N001",
            "count": len(results),
            "totalcount": results[0]['total_count'] if results else 0,
            "taggedcount": results[0]['tagged_count'] if results else 0,
            "results": results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# The bots one user may see — ACTIVE and tagged only.
@app.route('/get-user-bot-data', methods=['POST'])
@cross_origin()
def get_user_bot_data():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}

        required = ["custcode", "orgcode", "userid"]
        missing = [key for key in required if not _text(data, key)]
        if missing:
            return jsonify({
                "success": False,
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        refcursor_name = "user_bot_cursor"

        cursor.execute(
            """
            CALL usp_get_user_bot_data(
                %s::varchar, %s::varchar, %s::int, %s::varchar, %s::int, %s::int, %s
            )
            """,
            (
                _text(data, 'custcode'), _text(data, 'orgcode'), int(data.get('userid')),
                _text(data, 'searchtext'),
                int(data.get('pageno') or 1), int(data.get('pagesize') or 20),
                refcursor_name,
            )
        )

        cursor.execute(f"FETCH ALL IN {refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute("COMMIT")

        return jsonify({
            "success": True,
            "statuscode": "S001" if results else "N001",
            "count": len(results),
            "totalcount": results[0]['total_count'] if results else 0,
            "results": results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# ===========================================================================
# 5.5 CHATBOT CONVERSATION
# ===========================================================================

# Call before saving each user query. Opens a session, or a new one once the
# current session reaches max_queries_per_session. S001 same session, S002 new.
@app.route('/get-or-start-bot-conversation', methods=['POST'])
@cross_origin()
def get_or_start_bot_conversation():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}

        required = ["custcode", "orgcode", "botid", "userid", "languagecode", "usercode"]
        missing = [key for key in required if not _text(data, key)]
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            """
            CALL usp_get_or_start_bot_conversation(
                %s::varchar, %s::varchar, %s::int, %s::int, %s::varchar, %s::varchar,
                %s::varchar, NULL::int, NULL::varchar, NULL::int, NULL::int, NULL::int,
                NULL::boolean, NULL::varchar
            )
            """,
            (
                _text(data, 'custcode'), _text(data, 'orgcode'),
                int(data.get('botid')), int(data.get('userid')),
                _text(data, 'languagecode'), _text(data, 'usercode'),
                _text(data, 'threadcode'),              # empty on the first message of a new chat
            )
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        return jsonify({
            "success": status_code in ("S001", "S002"),
            "statuscode": status_code,
            "threadcode": output.get('p_thread_code'),
            "botconversationid": output.get('p_bot_conversation_id'),
            "botconversationcode": output.get('p_bot_conversation_code'),
            "sessionno": output.get('p_session_no'),
            "querycount": output.get('p_query_count'),
            "maxqueriespersession": output.get('p_max_queries_per_session'),
            "isnewsession": output.get('p_is_new_session')
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Updates title, end time, intent, sentiment, status, rating and feedback.
# Only the fields sent are changed.
@app.route('/save-bot-conversation', methods=['POST'])
@cross_origin()
def save_bot_conversation():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}

        required = ["custcode", "orgcode", "botconversationid", "usercode"]
        missing = [key for key in required if not _text(data, key)]
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            """
            CALL usp_save_bot_conversation(
                %s::varchar, %s::varchar, %s::int, %s::varchar, %s::timestamptz,
                %s::varchar, %s::varchar, %s::varchar, %s::smallint, %s::varchar, %s::varchar,
                NULL::varchar
            )
            """,
            (
                _text(data, 'custcode'), _text(data, 'orgcode'), int(data.get('botconversationid')),
                _text(data, 'title'),
                _text(data, 'enddatetime'),                                # ISO text, e.g. 2026-09-22T10:30:00Z
                _text(data, 'intentcode'),
                (_text(data, 'sentimentcode') or '').upper() or None,      # POSITIVE / NEGATIVE / NEUTRAL
                (_text(data, 'conversationstatus') or '').upper() or None,  # OPEN / COMPLETED
                _int(data, 'userrating'),                                  # 1 to 5
                _text(data, 'userfeedback'),
                _text(data, 'usercode'),
            )
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        return jsonify({
            "success": status_code == "S002",
            "statuscode": status_code,
            "botconversationid": int(data.get('botconversationid'))
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Saves messages. Every USER row adds 1 to the session's query_count.
@app.route('/save-bot-conversation-message', methods=['POST'])
@cross_origin()
def save_bot_conversation_message():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        messages = data.get('messages')

        required = ["custcode", "orgcode", "botconversationid", "usercode"]
        missing = [key for key in required if not _text(data, key)]
        if not isinstance(messages, list) or not messages:
            missing.append("messages")
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            """
            CALL usp_save_bot_conversation_message(
                %s::varchar, %s::varchar, %s::int, %s::jsonb, %s::varchar,
                NULL::int, NULL::int, NULL::int, NULL::varchar
            )
            """,
            (_text(data, 'custcode'), _text(data, 'orgcode'), int(data.get('botconversationid')),
             json.dumps(messages), _text(data, 'usercode'))
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        return jsonify({
            "success": status_code == "S001",
            "statuscode": status_code,
            "botconversationid": int(data.get('botconversationid')),
            "insertedcount": output.get('p_inserted_count'),
            "totalmessages": output.get('p_total_messages'),
            "querycount": output.get('p_query_count')
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# The Conversations list, with filters and paging.
@app.route('/get-bot-conversation-data', methods=['POST'])
@cross_origin()
def get_bot_conversation_data():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        custcode = _text(data, 'custcode')
        orgcode = _text(data, 'orgcode')

        if not custcode or not orgcode:
            return jsonify({
                "success": False,
                "message": "Missing required parameters: custcode or orgcode"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        refcursor_name = "bot_conversation_cursor"

        cursor.execute(
            """
            CALL usp_get_bot_conversation_data(
                %s::varchar, %s::varchar, %s::int, %s::int, %s::int, %s::varchar,
                %s::varchar, %s::varchar, %s::date, %s::date, %s::varchar,
                %s::int, %s::int, %s
            )
            """,
            (
                custcode, orgcode,
                _int(data, 'botconversationid'), _int(data, 'botid'), _int(data, 'userid'),
                _text(data, 'threadcode'),
                (_text(data, 'conversationstatus') or '').upper() or None,
                (_text(data, 'sentimentcode') or '').upper() or None,
                _text(data, 'fromdate'), _text(data, 'todate'),           # YYYY-MM-DD
                _text(data, 'searchtext'),
                int(data.get('pageno') or 1), int(data.get('pagesize') or 20),
                refcursor_name,
            )
        )

        cursor.execute(f"FETCH ALL IN {refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute("COMMIT")

        return jsonify({
            "success": True,
            "statuscode": "S001" if results else "N001",
            "count": len(results),
            "totalcount": results[0]['total_count'] if results else 0,
            "results": results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Messages of one session (botconversationid) or of the whole thread across its
# sessions (threadcode).
@app.route('/get-bot-conversation-message-data', methods=['POST'])
@cross_origin()
def get_bot_conversation_message_data():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        custcode = _text(data, 'custcode')
        orgcode = _text(data, 'orgcode')

        if not custcode or not orgcode:
            return jsonify({
                "success": False,
                "message": "Missing required parameters: custcode or orgcode"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        refcursor_name = "bot_message_cursor"

        cursor.execute(
            """
            CALL usp_get_bot_conversation_message_data(
                %s::varchar, %s::varchar, %s::int, %s::varchar, %s::int, %s::int, %s
            )
            """,
            (
                custcode, orgcode,
                _int(data, 'botconversationid'), _text(data, 'threadcode'),
                int(data.get('pageno') or 1), int(data.get('pagesize') or 50),
                refcursor_name,
            )
        )

        cursor.execute(f"FETCH ALL IN {refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute("COMMIT")

        return jsonify({
            "success": True,
            "statuscode": "S001" if results else "N001",
            "count": len(results),
            "totalcount": results[0]['total_count'] if results else 0,
            "results": results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Soft deletes sessions and their messages.
@app.route('/delete-bot-conversation', methods=['POST'])
@cross_origin()
def delete_bot_conversation():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        conversation_ids = _ids_text(data.get('botconversationid'))    # comma separated

        missing = [key for key in ["custcode", "orgcode", "usercode"] if not _text(data, key)]
        if not conversation_ids:
            missing.append("botconversationid")
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            "CALL usp_delete_bot_conversation(%s::varchar, %s::varchar, %s::varchar, %s::varchar, NULL::int, NULL::varchar)",
            (_text(data, 'custcode'), _text(data, 'orgcode'), conversation_ids, _text(data, 'usercode'))
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        return jsonify({
            "success": status_code == "S001",
            "statuscode": status_code,
            "botconversationid": conversation_ids,
            "deletedcount": output.get('p_deleted_count'),
            "message": "Conversation deleted." if status_code == "S001" else "No matching conversation found."
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# ===========================================================================
# 5.6 CHATBOT ANALYTICS
# ===========================================================================

# Builds one bot's daily rollup row. Safe to run again for the same date.
@app.route('/save-bot-analytics-daily', methods=['POST'])
@cross_origin()
def save_bot_analytics_daily():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}

        required = ["custcode", "orgcode", "botid", "analyticsdate", "usercode"]
        missing = [key for key in required if not _text(data, key)]
        if missing:
            return jsonify({
                "success": False,
                "statuscode": "F001",
                "message": f"Missing required parameters: {', '.join(missing)}"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        cursor.execute(
            "CALL usp_save_bot_analytics_daily(%s::varchar, %s::varchar, %s::int, %s::date, %s::varchar, NULL::int, NULL::varchar)",
            (_text(data, 'custcode'), _text(data, 'orgcode'), int(data.get('botid')),
             _text(data, 'analyticsdate'), _text(data, 'usercode'))          # YYYY-MM-DD
        )

        row = cursor.fetchone()
        colnames = [desc[0] for desc in cursor.description]
        output = dict(zip(colnames, row)) if row else {}

        cursor.execute("COMMIT")

        status_code = output.get('p_status_code')
        return jsonify({
            "success": status_code == "S001",
            "statuscode": status_code,
            "botanalyticsdailyid": output.get('p_bot_analytics_daily_id')
        }), HTTP_STATUS_BY_CODE.get(status_code, 400)

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Summary figures, daily trend and top intents in one call.
@app.route('/get-bot-analytics-summary', methods=['POST'])
@cross_origin()
def get_bot_analytics_summary():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        custcode = _text(data, 'custcode')
        orgcode = _text(data, 'orgcode')

        if not custcode or not orgcode:
            return jsonify({
                "success": False,
                "message": "Missing required parameters: custcode or orgcode"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        summary_refcursor_name = "analytics_summary_cursor"
        daily_refcursor_name = "analytics_daily_cursor"
        intent_refcursor_name = "analytics_intent_cursor"

        cursor.execute(
            """
            CALL usp_get_bot_analytics_summary(
                %s::varchar, %s::varchar, %s::int, %s::date, %s::date, %s::int, %s, %s, %s
            )
            """,
            (
                custcode, orgcode, _int(data, 'botid'),
                _text(data, 'fromdate'), _text(data, 'todate'),           # YYYY-MM-DD
                int(data.get('topn') or 10),
                summary_refcursor_name, daily_refcursor_name, intent_refcursor_name,
            )
        )

        cursor.execute(f"FETCH ALL IN {summary_refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        summary_results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute(f"FETCH ALL IN {daily_refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        daily_results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute(f"FETCH ALL IN {intent_refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        intent_results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute("COMMIT")

        return jsonify({
            "success": True,
            "statuscode": "S001" if daily_results else "N001",
            "summary": summary_results[0] if summary_results else None,
            "daily": daily_results,
            "topintents": intent_results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# Recent Fallback Queries — what the Knowledge Base is missing.
@app.route('/get-bot-fallback-query-data', methods=['POST'])
@cross_origin()
def get_bot_fallback_query_data():
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        custcode = _text(data, 'custcode')
        orgcode = _text(data, 'orgcode')

        if not custcode or not orgcode:
            return jsonify({
                "success": False,
                "message": "Missing required parameters: custcode or orgcode"
            }), 400

        conn = get_aihubdata_db_connection()
        cursor = conn.cursor()
        cursor.execute("BEGIN")

        refcursor_name = "bot_fallback_cursor"

        cursor.execute(
            """
            CALL usp_get_bot_fallback_query_data(
                %s::varchar, %s::varchar, %s::int, %s::date, %s::date, %s::int, %s::int, %s
            )
            """,
            (
                custcode, orgcode, _int(data, 'botid'),
                _text(data, 'fromdate'), _text(data, 'todate'),           # YYYY-MM-DD
                int(data.get('pageno') or 1), int(data.get('pagesize') or 20),
                refcursor_name,
            )
        )

        cursor.execute(f"FETCH ALL IN {refcursor_name}")
        rows = cursor.fetchall()
        colnames = [desc[0] for desc in cursor.description]
        results = [dict(zip(colnames, row)) for row in rows]

        cursor.execute("COMMIT")

        return jsonify({
            "success": True,
            "statuscode": "S001" if results else "N001",
            "count": len(results),
            "totalcount": results[0]['total_count'] if results else 0,
            "results": results
        }), 200

    except Exception as e:
        if conn:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                conn.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            release_aihub_db(conn)


# ===========================================================================
# RUN
# ===========================================================================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
