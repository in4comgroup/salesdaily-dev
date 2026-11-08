--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11 (7d7ea2a)
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


--
-- Name: blocklist_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.blocklist_kind AS ENUM (
    'email',
    'domain',
    'company',
    'person'
);


--
-- Name: card_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.card_category AS ENUM (
    'client_activity',
    'colleagues_activity',
    'business_info',
    'action_required',
    'ambiguity',
    'data_intelligence',
    'momentum',
    'log_only',
    'new_order',
    'support'
);


--
-- Name: card_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.card_priority AS ENUM (
    'normal',
    'high'
);


--
-- Name: deal_contact_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.deal_contact_role AS ENUM (
    'decision_maker',
    'influencer',
    'expert',
    'initiator',
    'economic_buyer',
    'champion',
    'blocker',
    'user',
    'gatekeeper'
);


--
-- Name: deal_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.deal_status AS ENUM (
    'active',
    'cancelled',
    'deleted'
);


--
-- Name: enrichment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enrichment_status AS ENUM (
    'enriched',
    'review',
    'no_match'
);


--
-- Name: entity_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.entity_status AS ENUM (
    'active',
    'suspended',
    'initial',
    'deleted',
    'blocked'
);


--
-- Name: funnel_phase; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.funnel_phase AS ENUM (
    'awareness',
    'interest',
    'decision',
    'action',
    'retention'
);


--
-- Name: order_link_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_link_status AS ENUM (
    'active',
    'used',
    'revoked',
    'expired'
);


--
-- Name: order_request_item_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_request_item_mode AS ENUM (
    'explicit',
    'discovery'
);


--
-- Name: order_request_item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_request_item_status AS ENUM (
    'pending',
    'added',
    'skipped'
);


--
-- Name: order_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_request_status AS ENUM (
    'parsing',
    'ready',
    'assembling',
    'done',
    'abandoned'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'draft',
    'awaiting_client',
    'confirmed',
    'finalized',
    'cancelled'
);


--
-- Name: org_attribution; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_attribution AS ENUM (
    'own_org',
    'external',
    'unknown'
);


--
-- Name: org_identity_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_identity_kind AS ENUM (
    'name',
    'website',
    'address'
);


--
-- Name: parse_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.parse_status AS ENUM (
    'pending',
    'processing',
    'complete',
    'failed',
    'skipped'
);


--
-- Name: pipeline_run_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pipeline_run_status AS ENUM (
    'running',
    'success',
    'failed'
);


--
-- Name: pipeline_run_trigger; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pipeline_run_trigger AS ENUM (
    'cron',
    'manual'
);


--
-- Name: r2_upload_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.r2_upload_status AS ENUM (
    'pending',
    'complete',
    'failed'
);


--
-- Name: role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role AS ENUM (
    'member',
    'admin',
    'owner'
);


--
-- Name: rule_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rule_type AS ENUM (
    'System',
    'Custom'
);


--
-- Name: source_item_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.source_item_kind AS ENUM (
    'email',
    'chat_message',
    'drive_file',
    'dropoff_file',
    'attachment',
    'inline_image',
    'derived_audio',
    'aichat_session'
);


--
-- Name: source_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.source_provider AS ENUM (
    'nylas',
    'gchat',
    'gdrive',
    'dropoff',
    'whatsapp',
    'aichat',
    'telegram',
    'imap'
);


--
-- Name: source_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.source_status AS ENUM (
    'active',
    'inactive'
);


--
-- Name: source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.source_type AS ENUM (
    'external',
    'internal'
);


--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'todo',
    'in_progress',
    'done',
    'closed'
);


--
-- Name: task_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_type AS ENUM (
    'meet',
    'call',
    'email',
    'offer',
    'docs',
    'other',
    'support'
);


--
-- Name: immutable_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.immutable_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $_$ SELECT public.unaccent('public.unaccent', $1) $_$;


--
-- Name: to_or_tsquery(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.to_or_tsquery(t text) RETURNS tsquery
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
        SELECT to_tsquery('simple',
          nullif(
            array_to_string(
              array(
                SELECT x
                FROM unnest(string_to_array(
                  regexp_replace(lower(coalesce(t, '')), '[^a-z0-9 ]+', ' ', 'g'),
                  ' ')) AS x
                WHERE x <> ''
              ),
              ' | '
            ),
            ''
          )
        )
      $$;


--
-- Name: translit_cyr_lat(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.translit_cyr_lat(t text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$
        SELECT translate(
          regexp_replace(
          regexp_replace(
          regexp_replace(
          regexp_replace(
          regexp_replace(
          regexp_replace(
          regexp_replace(
            lower(coalesce(t, '')),
            'ж', 'zh', 'g'),
            'ц', 'ts', 'g'),
            'ч', 'ch', 'g'),
            'ш', 'sh', 'g'),
            'щ', 'shch', 'g'),
            'ю', 'yu', 'g'),
            'я', 'ya', 'g'),
          'абвгдеёзийклмнопрстуфхыэъь',
          'abvgdeeziyklmnoprstufhye'
        )
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp without time zone,
    refresh_token_expires_at timestamp without time zone,
    scope text,
    password text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: apikey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apikey (
    id text NOT NULL,
    name text,
    start text,
    prefix text,
    key text NOT NULL,
    refill_interval integer,
    refill_amount integer,
    last_refill_at timestamp without time zone,
    enabled boolean DEFAULT true,
    rate_limit_enabled boolean DEFAULT true,
    rate_limit_time_window integer DEFAULT 86400000,
    rate_limit_max integer DEFAULT 10,
    request_count integer DEFAULT 0,
    remaining integer,
    last_request timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    permissions text,
    metadata text,
    config_id text DEFAULT 'default'::text NOT NULL,
    reference_id text NOT NULL
);


--
-- Name: card; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card (
    id text NOT NULL,
    organization_id text NOT NULL,
    priority public.card_priority DEFAULT 'normal'::public.card_priority NOT NULL,
    category public.card_category NOT NULL,
    message jsonb DEFAULT '{}'::jsonb NOT NULL,
    accepted boolean DEFAULT false NOT NULL,
    rejection_reason text,
    source_item_id text,
    rule_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    result_task_id text,
    result_order_id text
);


--
-- Name: card_client; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_client (
    card_id text NOT NULL,
    client_id text NOT NULL
);


--
-- Name: card_contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_contact (
    card_id text NOT NULL,
    contact_id text NOT NULL
);


--
-- Name: card_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_user (
    card_id text NOT NULL,
    user_id text NOT NULL
);


--
-- Name: client; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client (
    id text NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    web_url text,
    funnel_phase public.funnel_phase DEFAULT 'awareness'::public.funnel_phase NOT NULL,
    status public.entity_status DEFAULT 'active'::public.entity_status NOT NULL,
    user_id text NOT NULL,
    organization_id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    aliases text[],
    name_phys text,
    comment text,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    enrichment_status public.enrichment_status,
    enrichment_candidates jsonb,
    currency text DEFAULT 'RUB'::text NOT NULL
);


--
-- Name: contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact (
    id text NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    "position" text,
    client_id text,
    status public.entity_status DEFAULT 'active'::public.entity_status NOT NULL,
    user_id text NOT NULL,
    organization_id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    name_native text,
    aliases text[]
);


--
-- Name: deal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    funnel_stage_id text NOT NULL,
    client_id text NOT NULL,
    value numeric(14,2),
    currency text DEFAULT 'RUB'::text NOT NULL,
    user_id text NOT NULL,
    organization_id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    reasoning text,
    changes text,
    status public.deal_status DEFAULT 'active'::public.deal_status NOT NULL,
    "position" text,
    last_moved_by text
);


--
-- Name: deal_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_activity (
    id text NOT NULL,
    deal_id text NOT NULL,
    actor text NOT NULL,
    actor_user_id text,
    from_stage_id text,
    to_stage_id text,
    note text,
    reasoning text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: deal_contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_contact (
    deal_id text NOT NULL,
    contact_id text NOT NULL,
    role public.deal_contact_role
);


--
-- Name: deal_funnel_stage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_funnel_stage (
    id text NOT NULL,
    name text NOT NULL,
    closure_probability numeric(4,3) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_system boolean DEFAULT true NOT NULL,
    owner_organization_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: discovery_blocklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_blocklist (
    id text NOT NULL,
    organization_id text NOT NULL,
    kind public.blocklist_kind NOT NULL,
    match_key text NOT NULL,
    label text NOT NULL,
    note text,
    source_item_id text,
    created_by_user_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitation (
    id text NOT NULL,
    organization_id text NOT NULL,
    email text NOT NULL,
    role text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    inviter_id text NOT NULL
);


--
-- Name: member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: notification_read_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_read_state (
    organization_id text NOT NULL,
    user_id text NOT NULL,
    last_seen_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."order" (
    id text NOT NULL,
    order_date timestamp without time zone DEFAULT now() NOT NULL,
    description text,
    status public.order_status DEFAULT 'draft'::public.order_status NOT NULL,
    total_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    currency text DEFAULT 'RUB'::text NOT NULL,
    client_id text NOT NULL,
    user_id text NOT NULL,
    organization_id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0 NOT NULL
);


--
-- Name: order_access_link; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_access_link (
    id text NOT NULL,
    order_id text NOT NULL,
    token_hash text NOT NULL,
    recipient_email text,
    status public.order_link_status DEFAULT 'active'::public.order_link_status NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_accessed_at timestamp without time zone,
    confirmed_at timestamp without time zone
);


--
-- Name: order_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_item (
    id text NOT NULL,
    order_id text NOT NULL,
    product_id text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    position_price numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: order_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_request (
    id text NOT NULL,
    raw_text text NOT NULL,
    comment text,
    status public.order_request_status DEFAULT 'parsing'::public.order_request_status NOT NULL,
    parse_error text,
    client_id text NOT NULL,
    order_id text,
    user_id text NOT NULL,
    organization_id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: order_request_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_request_item (
    id text NOT NULL,
    request_id text NOT NULL,
    ordinal integer DEFAULT 0 NOT NULL,
    raw_snippet text NOT NULL,
    label text,
    mode public.order_request_item_mode NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    search_phrase text,
    quantity_hint text,
    status public.order_request_item_status DEFAULT 'pending'::public.order_request_item_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    search_terms text[]
);


--
-- Name: org_identity_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_identity_entry (
    id text NOT NULL,
    organization_id text NOT NULL,
    kind public.org_identity_kind NOT NULL,
    match_key text NOT NULL,
    label text NOT NULL,
    note text,
    created_by_user_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: organization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    created_at timestamp without time zone NOT NULL,
    metadata text,
    web_url text,
    address text,
    email text,
    phone text
);


--
-- Name: pipeline_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_run (
    id text NOT NULL,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    finished_at timestamp without time zone,
    trigger public.pipeline_run_trigger NOT NULL,
    status public.pipeline_run_status DEFAULT 'running'::public.pipeline_run_status NOT NULL,
    sync_sources_total integer DEFAULT 0 NOT NULL,
    sync_sources_succeeded integer DEFAULT 0 NOT NULL,
    sync_sources_failed integer DEFAULT 0 NOT NULL,
    sync_items_inserted integer DEFAULT 0 NOT NULL,
    sync_items_updated integer DEFAULT 0 NOT NULL,
    parse_attempted integer DEFAULT 0 NOT NULL,
    parse_complete integer DEFAULT 0 NOT NULL,
    parse_skipped integer DEFAULT 0 NOT NULL,
    parse_failed integer DEFAULT 0 NOT NULL,
    parse_capped integer DEFAULT 0 NOT NULL,
    upload_attempted integer DEFAULT 0 NOT NULL,
    upload_succeeded integer DEFAULT 0 NOT NULL,
    upload_failed integer DEFAULT 0 NOT NULL,
    errors_json jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product (
    id text NOT NULL,
    name text NOT NULL,
    category text,
    web_page_url text,
    price numeric(14,2),
    image_url text,
    total_stock integer,
    accounting_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    additional_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    stock_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.entity_status DEFAULT 'active'::public.entity_status NOT NULL,
    organization_id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    name_norm text GENERATED ALWAYS AS (lower(public.immutable_unaccent(public.translit_cyr_lat(name)))) STORED,
    region_norm text GENERATED ALWAYS AS (lower(public.immutable_unaccent(public.translit_cyr_lat((additional_metadata ->> 'region'::text))))) STORED,
    is_drink boolean GENERATED ALWAYS AS (((category IS DISTINCT FROM 'Бокалы'::text) AND (category IS DISTINCT FROM 'Хранение бутылок'::text) AND (category IS DISTINCT FROM 'Подарочная упаковка'::text) AND (category IS DISTINCT FROM 'Сиропы'::text) AND (category IS DISTINCT FROM 'Тоники'::text) AND (category IS DISTINCT FROM 'Минеральная вода'::text) AND (category IS DISTINCT FROM 'Газированная вода'::text))) STORED,
    is_gift boolean GENERATED ALWAYS AS ((((additional_metadata ->> 'gift_packaging'::text) = 'Да'::text) OR (name ~~* '%подароч%'::text) OR (name ~~* '%деревян%'::text))) STORED,
    search_vector tsvector GENERATED ALWAYS AS (((((((setweight(to_tsvector('simple'::regconfig, COALESCE(name, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(lower(public.immutable_unaccent(public.translit_cyr_lat(name))), ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((additional_metadata ->> 'vendor'::text), ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(category, ''::text)), 'C'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((additional_metadata ->> 'type'::text), ''::text)), 'C'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((additional_metadata ->> 'country_name'::text), ''::text)), 'D'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(lower(public.immutable_unaccent(public.translit_cyr_lat((additional_metadata ->> 'region'::text)))), ''::text)), 'D'::"char"))) STORED
);


--
-- Name: product_alias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_alias (
    id text NOT NULL,
    organization_id text NOT NULL,
    alias_norm text NOT NULL,
    canonical text NOT NULL,
    kind text DEFAULT 'brand'::text NOT NULL
);


--
-- Name: rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule (
    id text NOT NULL,
    name text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    type public.rule_type DEFAULT 'Custom'::public.rule_type NOT NULL,
    user_id text NOT NULL,
    organization_id text NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL,
    active_organization_id text,
    active_organization_name text,
    active_organization_logo text,
    active_organization_slug text,
    impersonated_by text
);


--
-- Name: source; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source (
    id text NOT NULL,
    type public.source_type DEFAULT 'external'::public.source_type NOT NULL,
    provider public.source_provider NOT NULL,
    provider_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    owner_organization_id text,
    is_system boolean DEFAULT false NOT NULL,
    name text NOT NULL,
    description text,
    credentials_ref text,
    status public.source_status DEFAULT 'active'::public.source_status NOT NULL,
    created_by_user_id text,
    last_synced_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    automated_parsing_is_allowed boolean DEFAULT true NOT NULL,
    template_id text
);


--
-- Name: source_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_item (
    id text NOT NULL,
    source_id text NOT NULL,
    organization_id text,
    external_id text NOT NULL,
    external_type public.source_item_kind NOT NULL,
    external_url text,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    parent_source_item_id text,
    thread_external_id text,
    filename text,
    mime_type text,
    size_bytes bigint,
    source_created_at timestamp without time zone,
    fetched_at timestamp without time zone DEFAULT now() NOT NULL,
    parse_status public.parse_status DEFAULT 'pending'::public.parse_status NOT NULL,
    parsed_at timestamp without time zone,
    parse_error text,
    parser_version text,
    parser_model text,
    r2_upload_status public.r2_upload_status DEFAULT 'pending'::public.r2_upload_status NOT NULL,
    r2_uploaded_at timestamp without time zone,
    markdown_r2_key text,
    markdown_r2_size_bytes bigint,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    parsed_markdown text,
    card_analysis_scanned_at timestamp without time zone,
    deal_analysis_scanned_at timestamp without time zone,
    discovery_scanned_at timestamp without time zone,
    org_attribution public.org_attribution DEFAULT 'unknown'::public.org_attribution NOT NULL
);


--
-- Name: source_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_template (
    id text NOT NULL,
    type public.source_type DEFAULT 'external'::public.source_type NOT NULL,
    provider public.source_provider NOT NULL,
    name text NOT NULL,
    description text,
    default_provider_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    default_automated_parsing_is_allowed boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_visible_to_orgs boolean DEFAULT true NOT NULL,
    status public.source_status DEFAULT 'active'::public.source_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    type public.task_type DEFAULT 'other'::public.task_type NOT NULL,
    priority public.task_priority DEFAULT 'medium'::public.task_priority NOT NULL,
    status public.task_status DEFAULT 'todo'::public.task_status NOT NULL,
    user_id text NOT NULL,
    assignee_id text NOT NULL,
    client_id text,
    contact_id text,
    organization_id text NOT NULL,
    due_date timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deal_id text
);


--
-- Name: teardown_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teardown_log (
    id text NOT NULL,
    organization_id text NOT NULL,
    source_id text NOT NULL,
    source_name text NOT NULL,
    admin_user_id text,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    role text DEFAULT 'user'::text,
    banned boolean DEFAULT false,
    ban_reason text,
    ban_expires timestamp without time zone,
    department text
);


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: apikey apikey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apikey
    ADD CONSTRAINT apikey_pkey PRIMARY KEY (id);


--
-- Name: card_client card_client_card_id_client_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_client
    ADD CONSTRAINT card_client_card_id_client_id_pk PRIMARY KEY (card_id, client_id);


--
-- Name: card_contact card_contact_card_id_contact_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_contact
    ADD CONSTRAINT card_contact_card_id_contact_id_pk PRIMARY KEY (card_id, contact_id);


--
-- Name: card card_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card
    ADD CONSTRAINT card_pkey PRIMARY KEY (id);


--
-- Name: card_user card_user_card_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_user
    ADD CONSTRAINT card_user_card_id_user_id_pk PRIMARY KEY (card_id, user_id);


--
-- Name: client client_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_pkey PRIMARY KEY (id);


--
-- Name: contact contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_pkey PRIMARY KEY (id);


--
-- Name: deal_activity deal_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activity
    ADD CONSTRAINT deal_activity_pkey PRIMARY KEY (id);


--
-- Name: deal_contact deal_contact_deal_id_contact_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contact
    ADD CONSTRAINT deal_contact_deal_id_contact_id_pk PRIMARY KEY (deal_id, contact_id);


--
-- Name: deal_funnel_stage deal_funnel_stage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_funnel_stage
    ADD CONSTRAINT deal_funnel_stage_pkey PRIMARY KEY (id);


--
-- Name: deal deal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal
    ADD CONSTRAINT deal_pkey PRIMARY KEY (id);


--
-- Name: discovery_blocklist discovery_blocklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_blocklist
    ADD CONSTRAINT discovery_blocklist_pkey PRIMARY KEY (id);


--
-- Name: invitation invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);


--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);


--
-- Name: notification_read_state notification_read_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_read_state
    ADD CONSTRAINT notification_read_state_pkey PRIMARY KEY (organization_id, user_id);


--
-- Name: order_access_link order_access_link_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_access_link
    ADD CONSTRAINT order_access_link_pkey PRIMARY KEY (id);


--
-- Name: order_item order_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_pkey PRIMARY KEY (id);


--
-- Name: order order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_pkey PRIMARY KEY (id);


--
-- Name: order_request_item order_request_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_request_item
    ADD CONSTRAINT order_request_item_pkey PRIMARY KEY (id);


--
-- Name: order_request order_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_request
    ADD CONSTRAINT order_request_pkey PRIMARY KEY (id);


--
-- Name: org_identity_entry org_identity_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_identity_entry
    ADD CONSTRAINT org_identity_entry_pkey PRIMARY KEY (id);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: organization organization_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_slug_unique UNIQUE (slug);


--
-- Name: pipeline_run pipeline_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_run
    ADD CONSTRAINT pipeline_run_pkey PRIMARY KEY (id);


--
-- Name: product_alias product_alias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_alias
    ADD CONSTRAINT product_alias_pkey PRIMARY KEY (id);


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);


--
-- Name: rule rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule
    ADD CONSTRAINT rule_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_unique UNIQUE (token);


--
-- Name: source_item source_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_item
    ADD CONSTRAINT source_item_pkey PRIMARY KEY (id);


--
-- Name: source source_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source
    ADD CONSTRAINT source_pkey PRIMARY KEY (id);


--
-- Name: source_template source_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_template
    ADD CONSTRAINT source_template_pkey PRIMARY KEY (id);


--
-- Name: task task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_pkey PRIMARY KEY (id);


--
-- Name: teardown_log teardown_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teardown_log
    ADD CONSTRAINT teardown_log_pkey PRIMARY KEY (id);


--
-- Name: user user_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_unique UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: account_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "account_userId_idx" ON public.account USING btree (user_id);


--
-- Name: apikey_configId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "apikey_configId_idx" ON public.apikey USING btree (config_id);


--
-- Name: apikey_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX apikey_key_idx ON public.apikey USING btree (key);


--
-- Name: apikey_referenceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "apikey_referenceId_idx" ON public.apikey USING btree (reference_id);


--
-- Name: card_accepted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_accepted_idx ON public.card USING btree (accepted);


--
-- Name: card_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_category_idx ON public.card USING btree (category);


--
-- Name: card_client_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_client_clientId_idx" ON public.card_client USING btree (client_id);


--
-- Name: card_contact_contactid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_contact_contactid_idx ON public.card_contact USING btree (contact_id);


--
-- Name: card_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_organizationId_idx" ON public.card USING btree (organization_id);


--
-- Name: card_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_priority_idx ON public.card USING btree (priority);


--
-- Name: card_resultOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_resultOrderId_idx" ON public.card USING btree (result_order_id);


--
-- Name: card_resultTaskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_resultTaskId_idx" ON public.card USING btree (result_task_id);


--
-- Name: card_ruleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_ruleId_idx" ON public.card USING btree (rule_id);


--
-- Name: card_sourceItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_sourceItemId_idx" ON public.card USING btree (source_item_id);


--
-- Name: card_user_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_user_userId_idx" ON public.card_user USING btree (user_id);


--
-- Name: client_enrichmentStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "client_enrichmentStatus_idx" ON public.client USING btree (enrichment_status);


--
-- Name: client_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "client_organizationId_idx" ON public.client USING btree (organization_id);


--
-- Name: client_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_status_idx ON public.client USING btree (status);


--
-- Name: client_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "client_userId_idx" ON public.client USING btree (user_id);


--
-- Name: contact_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contact_clientId_idx" ON public.contact USING btree (client_id);


--
-- Name: contact_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contact_organizationId_idx" ON public.contact USING btree (organization_id);


--
-- Name: contact_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_status_idx ON public.contact USING btree (status);


--
-- Name: contact_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contact_userId_idx" ON public.contact USING btree (user_id);


--
-- Name: deal_activity_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_activity_createdAt_idx" ON public.deal_activity USING btree (created_at);


--
-- Name: deal_activity_dealId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_activity_dealId_idx" ON public.deal_activity USING btree (deal_id);


--
-- Name: deal_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_clientId_idx" ON public.deal USING btree (client_id);


--
-- Name: deal_contact_contactId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_contact_contactId_idx" ON public.deal_contact USING btree (contact_id);


--
-- Name: deal_funnelStageId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_funnelStageId_idx" ON public.deal USING btree (funnel_stage_id);


--
-- Name: deal_funnel_stage_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_funnel_stage_isActive_idx" ON public.deal_funnel_stage USING btree (is_active);


--
-- Name: deal_funnel_stage_isSystem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_funnel_stage_isSystem_idx" ON public.deal_funnel_stage USING btree (is_system);


--
-- Name: deal_funnel_stage_ownerOrganizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_funnel_stage_ownerOrganizationId_idx" ON public.deal_funnel_stage USING btree (owner_organization_id);


--
-- Name: deal_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_organizationId_idx" ON public.deal USING btree (organization_id);


--
-- Name: deal_stage_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_stage_position_idx ON public.deal USING btree (funnel_stage_id, "position");


--
-- Name: deal_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_status_idx ON public.deal USING btree (status);


--
-- Name: deal_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deal_userId_idx" ON public.deal USING btree (user_id);


--
-- Name: discovery_blocklist_org_kind_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX discovery_blocklist_org_kind_key_uidx ON public.discovery_blocklist USING btree (organization_id, kind, match_key);


--
-- Name: discovery_blocklist_organizationid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX discovery_blocklist_organizationid_idx ON public.discovery_blocklist USING btree (organization_id);


--
-- Name: invitation_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitation_email_idx ON public.invitation USING btree (email);


--
-- Name: invitation_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invitation_organizationId_idx" ON public.invitation USING btree (organization_id);


--
-- Name: member_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "member_organizationId_idx" ON public.member USING btree (organization_id);


--
-- Name: member_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "member_userId_idx" ON public.member USING btree (user_id);


--
-- Name: order_access_link_one_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX order_access_link_one_active_idx ON public.order_access_link USING btree (order_id) WHERE (status = 'active'::public.order_link_status);


--
-- Name: order_access_link_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_access_link_orderId_idx" ON public.order_access_link USING btree (order_id);


--
-- Name: order_access_link_tokenHash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "order_access_link_tokenHash_idx" ON public.order_access_link USING btree (token_hash);


--
-- Name: order_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_clientId_idx" ON public."order" USING btree (client_id);


--
-- Name: order_item_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_item_orderId_idx" ON public.order_item USING btree (order_id);


--
-- Name: order_item_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_item_productId_idx" ON public.order_item USING btree (product_id);


--
-- Name: order_orderDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_orderDate_idx" ON public."order" USING btree (order_date);


--
-- Name: order_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_organizationId_idx" ON public."order" USING btree (organization_id);


--
-- Name: order_request_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_request_clientId_idx" ON public.order_request USING btree (client_id);


--
-- Name: order_request_item_requestId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_request_item_requestId_idx" ON public.order_request_item USING btree (request_id);


--
-- Name: order_request_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_request_orderId_idx" ON public.order_request USING btree (order_id);


--
-- Name: order_request_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_request_organizationId_idx" ON public.order_request USING btree (organization_id);


--
-- Name: order_request_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_request_status_idx ON public.order_request USING btree (status);


--
-- Name: order_request_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_request_userId_idx" ON public.order_request USING btree (user_id);


--
-- Name: order_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_status_idx ON public."order" USING btree (status);


--
-- Name: order_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "order_userId_idx" ON public."order" USING btree (user_id);


--
-- Name: org_identity_entry_org_kind_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_identity_entry_org_kind_key_uidx ON public.org_identity_entry USING btree (organization_id, kind, match_key);


--
-- Name: org_identity_entry_organizationid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_identity_entry_organizationid_idx ON public.org_identity_entry USING btree (organization_id);


--
-- Name: organization_slug_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_slug_uidx ON public.organization USING btree (slug);


--
-- Name: pipeline_run_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pipeline_run_startedAt_idx" ON public.pipeline_run USING btree (started_at);


--
-- Name: product_alias_org_alias_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_alias_org_alias_uniq ON public.product_alias USING btree (organization_id, alias_norm);


--
-- Name: product_alias_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_alias_org_idx ON public.product_alias USING btree (organization_id);


--
-- Name: product_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_category_idx ON public.product USING btree (category);


--
-- Name: product_is_drink_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_is_drink_idx ON public.product USING btree (is_drink);


--
-- Name: product_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_name_idx ON public.product USING btree (name);


--
-- Name: product_name_norm_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_name_norm_trgm_idx ON public.product USING gin (name_norm public.gin_trgm_ops);


--
-- Name: product_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "product_organizationId_idx" ON public.product USING btree (organization_id);


--
-- Name: product_region_norm_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_region_norm_trgm_idx ON public.product USING gin (region_norm public.gin_trgm_ops);


--
-- Name: product_search_vector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_search_vector_idx ON public.product USING gin (search_vector);


--
-- Name: product_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_status_idx ON public.product USING btree (status);


--
-- Name: rule_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "rule_organizationId_idx" ON public.rule USING btree (organization_id);


--
-- Name: rule_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_type_idx ON public.rule USING btree (type);


--
-- Name: rule_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "rule_userId_idx" ON public.rule USING btree (user_id);


--
-- Name: session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "session_userId_idx" ON public.session USING btree (user_id);


--
-- Name: source_isSystem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_isSystem_idx" ON public.source USING btree (is_system);


--
-- Name: source_item_org_attribution_own_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_item_org_attribution_own_idx ON public.source_item USING btree (organization_id) WHERE (org_attribution = 'own_org'::public.org_attribution);


--
-- Name: source_item_org_sourceCreatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_item_org_sourceCreatedAt_idx" ON public.source_item USING btree (organization_id, source_created_at);


--
-- Name: source_item_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_item_organizationId_idx" ON public.source_item USING btree (organization_id);


--
-- Name: source_item_parentSourceItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_item_parentSourceItemId_idx" ON public.source_item USING btree (parent_source_item_id);


--
-- Name: source_item_parseStatus_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_item_parseStatus_pending_idx" ON public.source_item USING btree (parse_status) WHERE (parse_status = ANY (ARRAY['pending'::public.parse_status, 'failed'::public.parse_status]));


--
-- Name: source_item_r2UploadStatus_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_item_r2UploadStatus_pending_idx" ON public.source_item USING btree (r2_upload_status) WHERE (r2_upload_status = ANY (ARRAY['pending'::public.r2_upload_status, 'failed'::public.r2_upload_status]));


--
-- Name: source_item_sourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_item_sourceId_idx" ON public.source_item USING btree (source_id);


--
-- Name: source_item_source_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX source_item_source_external_uidx ON public.source_item USING btree (source_id, external_id);


--
-- Name: source_item_threadExternalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_item_threadExternalId_idx" ON public.source_item USING btree (thread_external_id);


--
-- Name: source_ownerOrganizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_ownerOrganizationId_idx" ON public.source USING btree (owner_organization_id);


--
-- Name: source_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_provider_idx ON public.source USING btree (provider);


--
-- Name: source_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_status_idx ON public.source USING btree (status);


--
-- Name: source_templateId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_templateId_idx" ON public.source USING btree (template_id);


--
-- Name: source_template_isDefault_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "source_template_isDefault_idx" ON public.source_template USING btree (is_default);


--
-- Name: source_template_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_template_provider_idx ON public.source_template USING btree (provider);


--
-- Name: source_template_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_template_status_idx ON public.source_template USING btree (status);


--
-- Name: task_assigneeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_assigneeId_idx" ON public.task USING btree (assignee_id);


--
-- Name: task_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_clientId_idx" ON public.task USING btree (client_id);


--
-- Name: task_contactId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_contactId_idx" ON public.task USING btree (contact_id);


--
-- Name: task_dealId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_dealId_idx" ON public.task USING btree (deal_id);


--
-- Name: task_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_organizationId_idx" ON public.task USING btree (organization_id);


--
-- Name: task_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_status_idx ON public.task USING btree (status);


--
-- Name: task_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_userId_idx" ON public.task USING btree (user_id);


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- Name: account account_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: card_client card_client_card_id_card_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_client
    ADD CONSTRAINT card_client_card_id_card_id_fk FOREIGN KEY (card_id) REFERENCES public.card(id) ON DELETE CASCADE;


--
-- Name: card_client card_client_client_id_client_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_client
    ADD CONSTRAINT card_client_client_id_client_id_fk FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE CASCADE;


--
-- Name: card_contact card_contact_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_contact
    ADD CONSTRAINT card_contact_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.card(id) ON DELETE CASCADE;


--
-- Name: card_contact card_contact_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_contact
    ADD CONSTRAINT card_contact_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: card card_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card
    ADD CONSTRAINT card_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: card card_result_order_id_order_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card
    ADD CONSTRAINT card_result_order_id_order_id_fk FOREIGN KEY (result_order_id) REFERENCES public."order"(id) ON DELETE SET NULL;


--
-- Name: card card_result_task_id_task_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card
    ADD CONSTRAINT card_result_task_id_task_id_fk FOREIGN KEY (result_task_id) REFERENCES public.task(id) ON DELETE SET NULL;


--
-- Name: card card_rule_id_rule_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card
    ADD CONSTRAINT card_rule_id_rule_id_fk FOREIGN KEY (rule_id) REFERENCES public.rule(id) ON DELETE SET NULL;


--
-- Name: card card_source_item_id_source_item_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card
    ADD CONSTRAINT card_source_item_id_source_item_id_fk FOREIGN KEY (source_item_id) REFERENCES public.source_item(id) ON DELETE SET NULL;


--
-- Name: card_user card_user_card_id_card_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_user
    ADD CONSTRAINT card_user_card_id_card_id_fk FOREIGN KEY (card_id) REFERENCES public.card(id) ON DELETE CASCADE;


--
-- Name: card_user card_user_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_user
    ADD CONSTRAINT card_user_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: client client_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: client client_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: contact contact_client_id_client_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_client_id_client_id_fk FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE SET NULL;


--
-- Name: contact contact_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: contact contact_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: deal_activity deal_activity_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activity
    ADD CONSTRAINT deal_activity_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: deal_activity deal_activity_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activity
    ADD CONSTRAINT deal_activity_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deal(id) ON DELETE CASCADE;


--
-- Name: deal_activity deal_activity_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activity
    ADD CONSTRAINT deal_activity_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES public.deal_funnel_stage(id) ON DELETE SET NULL;


--
-- Name: deal_activity deal_activity_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_activity
    ADD CONSTRAINT deal_activity_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES public.deal_funnel_stage(id) ON DELETE SET NULL;


--
-- Name: deal deal_client_id_client_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal
    ADD CONSTRAINT deal_client_id_client_id_fk FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE RESTRICT;


--
-- Name: deal_contact deal_contact_contact_id_contact_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contact
    ADD CONSTRAINT deal_contact_contact_id_contact_id_fk FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: deal_contact deal_contact_deal_id_deal_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contact
    ADD CONSTRAINT deal_contact_deal_id_deal_id_fk FOREIGN KEY (deal_id) REFERENCES public.deal(id) ON DELETE CASCADE;


--
-- Name: deal deal_funnel_stage_id_deal_funnel_stage_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal
    ADD CONSTRAINT deal_funnel_stage_id_deal_funnel_stage_id_fk FOREIGN KEY (funnel_stage_id) REFERENCES public.deal_funnel_stage(id) ON DELETE RESTRICT;


--
-- Name: deal_funnel_stage deal_funnel_stage_owner_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_funnel_stage
    ADD CONSTRAINT deal_funnel_stage_owner_organization_id_organization_id_fk FOREIGN KEY (owner_organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: deal deal_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal
    ADD CONSTRAINT deal_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: deal deal_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal
    ADD CONSTRAINT deal_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: discovery_blocklist discovery_blocklist_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_blocklist
    ADD CONSTRAINT discovery_blocklist_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: discovery_blocklist discovery_blocklist_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_blocklist
    ADD CONSTRAINT discovery_blocklist_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: invitation invitation_inviter_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_inviter_id_user_id_fk FOREIGN KEY (inviter_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: invitation invitation_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: member member_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: member member_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: notification_read_state notification_read_state_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_read_state
    ADD CONSTRAINT notification_read_state_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: notification_read_state notification_read_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_read_state
    ADD CONSTRAINT notification_read_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: order_access_link order_access_link_order_id_order_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_access_link
    ADD CONSTRAINT order_access_link_order_id_order_id_fk FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: order order_client_id_client_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_client_id_client_id_fk FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE RESTRICT;


--
-- Name: order_item order_item_order_id_order_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_order_id_order_id_fk FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: order_item order_item_product_id_product_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_product_id_product_id_fk FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE RESTRICT;


--
-- Name: order order_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: order_request order_request_client_id_client_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_request
    ADD CONSTRAINT order_request_client_id_client_id_fk FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE RESTRICT;


--
-- Name: order_request_item order_request_item_request_id_order_request_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_request_item
    ADD CONSTRAINT order_request_item_request_id_order_request_id_fk FOREIGN KEY (request_id) REFERENCES public.order_request(id) ON DELETE CASCADE;


--
-- Name: order_request order_request_order_id_order_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_request
    ADD CONSTRAINT order_request_order_id_order_id_fk FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE SET NULL;


--
-- Name: order_request order_request_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_request
    ADD CONSTRAINT order_request_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: order_request order_request_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_request
    ADD CONSTRAINT order_request_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: order order_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: org_identity_entry org_identity_entry_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_identity_entry
    ADD CONSTRAINT org_identity_entry_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: org_identity_entry org_identity_entry_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_identity_entry
    ADD CONSTRAINT org_identity_entry_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: product_alias product_alias_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_alias
    ADD CONSTRAINT product_alias_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: product product_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: rule rule_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule
    ADD CONSTRAINT rule_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: rule rule_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule
    ADD CONSTRAINT rule_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: session session_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: source source_created_by_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source
    ADD CONSTRAINT source_created_by_user_id_user_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: source_item source_item_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_item
    ADD CONSTRAINT source_item_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: source_item source_item_parent_source_item_id_source_item_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_item
    ADD CONSTRAINT source_item_parent_source_item_id_source_item_id_fk FOREIGN KEY (parent_source_item_id) REFERENCES public.source_item(id) ON DELETE CASCADE;


--
-- Name: source_item source_item_source_id_source_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_item
    ADD CONSTRAINT source_item_source_id_source_id_fk FOREIGN KEY (source_id) REFERENCES public.source(id) ON DELETE CASCADE;


--
-- Name: source source_owner_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source
    ADD CONSTRAINT source_owner_organization_id_organization_id_fk FOREIGN KEY (owner_organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: source source_template_id_source_template_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source
    ADD CONSTRAINT source_template_id_source_template_id_fk FOREIGN KEY (template_id) REFERENCES public.source_template(id) ON DELETE SET NULL;


--
-- Name: task task_assignee_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_assignee_id_user_id_fk FOREIGN KEY (assignee_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: task task_client_id_client_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_client_id_client_id_fk FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE SET NULL;


--
-- Name: task task_contact_id_contact_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_contact_id_contact_id_fk FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE SET NULL;


--
-- Name: task task_deal_id_deal_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_deal_id_deal_id_fk FOREIGN KEY (deal_id) REFERENCES public.deal(id) ON DELETE SET NULL;


--
-- Name: task task_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: task task_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: teardown_log teardown_log_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teardown_log
    ADD CONSTRAINT teardown_log_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: teardown_log teardown_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teardown_log
    ADD CONSTRAINT teardown_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


