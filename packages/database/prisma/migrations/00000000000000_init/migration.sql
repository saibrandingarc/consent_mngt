BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[organizations] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [legal_name] NVARCHAR(1000),
    [business_type] NVARCHAR(1000),
    [country] CHAR(2),
    [timezone] NVARCHAR(1000),
    [default_language] NVARCHAR(1000),
    [default_regulation] NVARCHAR(1000),
    [billing_email] NVARCHAR(1000),
    [technical_contact] NVARCHAR(1000),
    [privacy_contact] NVARCHAR(1000),
    [dpo_details] NVARCHAR(1000),
    [store_consent_ip_address] BIT NOT NULL CONSTRAINT [organizations_store_consent_ip_address_df] DEFAULT 1,
    [geo_targeting_disabled] BIT NOT NULL CONSTRAINT [organizations_geo_targeting_disabled_df] DEFAULT 0,
    [white_label] NVARCHAR(max),
    [sso_config] NVARCHAR(max),
    [retention_policy] NVARCHAR(max),
    [data_residency_region] VARCHAR(32),
    [onboarding_step] INT NOT NULL CONSTRAINT [organizations_onboarding_step_df] DEFAULT 0,
    [onboarding_complete] BIT NOT NULL CONSTRAINT [organizations_onboarding_complete_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_status_df] DEFAULT 'ACTIVE',
    [deleted_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [organizations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [organizations_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [organizations_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER,
    [auth0_sub] NVARCHAR(1000),
    [email] NVARCHAR(1000) NOT NULL,
    [password_hash] NVARCHAR(1000),
    [first_name] NVARCHAR(1000) NOT NULL,
    [last_name] NVARCHAR(1000) NOT NULL,
    [email_verified] BIT NOT NULL CONSTRAINT [users_email_verified_df] DEFAULT 0,
    [email_verified_at] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [users_status_df] DEFAULT 'PENDING',
    [failed_login_count] INT NOT NULL CONSTRAINT [users_failed_login_count_df] DEFAULT 0,
    [locked_until] DATETIME2,
    [last_login_at] DATETIME2,
    [deleted_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [users_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_auth0_sub_key] UNIQUE NONCLUSTERED ([auth0_sub]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[roles] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [roles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [roles_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[permissions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [module] NVARCHAR(1000) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [permissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [permissions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [permissions_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[user_roles] (
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [role_id] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [user_roles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_roles_pkey] PRIMARY KEY CLUSTERED ([user_id],[role_id])
);

-- CreateTable
CREATE TABLE [dbo].[role_permissions] (
    [role_id] UNIQUEIDENTIFIER NOT NULL,
    [permission_id] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [role_permissions_pkey] PRIMARY KEY CLUSTERED ([role_id],[permission_id])
);

-- CreateTable
CREATE TABLE [dbo].[refresh_tokens] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [token_hash] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [revoked_at] DATETIME2,
    [user_agent] NVARCHAR(1000),
    [ip_address] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [refresh_tokens_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [refresh_tokens_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [refresh_tokens_token_hash_key] UNIQUE NONCLUSTERED ([token_hash])
);

-- CreateTable
CREATE TABLE [dbo].[login_history] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [success] BIT NOT NULL,
    [ip_address] NVARCHAR(1000),
    [user_agent] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [login_history_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [login_history_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[email_verification_tokens] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [token_hash] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [used_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [email_verification_tokens_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [email_verification_tokens_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [email_verification_tokens_token_hash_key] UNIQUE NONCLUSTERED ([token_hash])
);

-- CreateTable
CREATE TABLE [dbo].[password_reset_tokens] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [token_hash] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [used_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [password_reset_tokens_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [password_reset_tokens_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [password_reset_tokens_token_hash_key] UNIQUE NONCLUSTERED ([token_hash])
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER,
    [organization_id] UNIQUEIDENTIFIER,
    [action] NVARCHAR(1000) NOT NULL,
    [module] NVARCHAR(1000) NOT NULL,
    [previous_value] NVARCHAR(max),
    [new_value] NVARCHAR(max),
    [ip_address] NVARCHAR(1000),
    [user_agent] NVARCHAR(1000),
    [request_id] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[domains] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [hostname] NVARCHAR(1000) NOT NULL,
    [domain_key] NVARCHAR(1000) NOT NULL,
    [domain_type] NVARCHAR(1000) NOT NULL CONSTRAINT [domains_domain_type_df] DEFAULT 'ROOT',
    [is_production] BIT NOT NULL CONSTRAINT [domains_is_production_df] DEFAULT 1,
    [enabled] BIT NOT NULL CONSTRAINT [domains_enabled_df] DEFAULT 1,
    [group_name] NVARCHAR(1000),
    [scan_limit] INT NOT NULL CONSTRAINT [domains_scan_limit_df] DEFAULT 10,
    [scan_frequency] NVARCHAR(1000) NOT NULL CONSTRAINT [domains_scan_frequency_df] DEFAULT 'MANUAL',
    [next_scan_at] DATETIME2,
    [environment] NVARCHAR(1000) NOT NULL CONSTRAINT [domains_environment_df] DEFAULT 'production',
    [region] NVARCHAR(1000),
    [auto_blocking] BIT NOT NULL CONSTRAINT [domains_auto_blocking_df] DEFAULT 1,
    [debug_mode] BIT NOT NULL CONSTRAINT [domains_debug_mode_df] DEFAULT 0,
    [config_version] INT NOT NULL CONSTRAINT [domains_config_version_df] DEFAULT 1,
    [verification_status] NVARCHAR(1000) NOT NULL CONSTRAINT [domains_verification_status_df] DEFAULT 'PENDING',
    [verification_method] NVARCHAR(1000),
    [verification_token] NVARCHAR(1000) NOT NULL,
    [verified_at] DATETIME2,
    [last_verified_at] DATETIME2,
    [sdk_last_seen_at] DATETIME2,
    [sdk_last_heartbeat] NVARCHAR(max),
    [deleted_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [domains_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [domains_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [domains_hostname_key] UNIQUE NONCLUSTERED ([hostname]),
    CONSTRAINT [domains_domain_key_key] UNIQUE NONCLUSTERED ([domain_key])
);

-- CreateTable
CREATE TABLE [dbo].[installation_validations] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [overall_status] NVARCHAR(1000) NOT NULL,
    [checks] NVARCHAR(max) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [installation_validations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [installation_validations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[consent_categories] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [legal_basis] NVARCHAR(1000),
    [default_state] NVARCHAR(1000) NOT NULL CONSTRAINT [consent_categories_default_state_df] DEFAULT 'DISABLED',
    [required] BIT NOT NULL CONSTRAINT [consent_categories_required_df] DEFAULT 0,
    [sort_order] INT NOT NULL CONSTRAINT [consent_categories_sort_order_df] DEFAULT 0,
    [is_system] BIT NOT NULL CONSTRAINT [consent_categories_is_system_df] DEFAULT 0,
    [enabled] BIT NOT NULL CONSTRAINT [consent_categories_enabled_df] DEFAULT 1,
    [external_signals] NVARCHAR(max),
    [script_mappings] NVARCHAR(max),
    [vendor_purposes] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [consent_categories_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [consent_categories_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [consent_categories_domain_id_slug_key] UNIQUE NONCLUSTERED ([domain_id],[slug])
);

-- CreateTable
CREATE TABLE [dbo].[policy_versions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [version_number] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [policy_versions_status_df] DEFAULT 'DRAFT',
    [categories_snapshot] NVARCHAR(max),
    [banner_content] NVARCHAR(max),
    [legal_text] NVARCHAR(max),
    [regulation_config] NVARCHAR(max),
    [default_consent_states] NVARCHAR(max),
    [supported_languages] NVARCHAR(max),
    [scheduled_at] DATETIME2,
    [published_at] DATETIME2,
    [archived_at] DATETIME2,
    [requires_renewal] BIT NOT NULL CONSTRAINT [policy_versions_requires_renewal_df] DEFAULT 0,
    [renewal_reason] NVARCHAR(max),
    [change_summary] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [policy_versions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [policy_versions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [policy_versions_domain_id_version_number_key] UNIQUE NONCLUSTERED ([domain_id],[version_number])
);

-- CreateTable
CREATE TABLE [dbo].[consent_renewals] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [policy_version_id] UNIQUEIDENTIFIER,
    [reason] NVARCHAR(1000) NOT NULL,
    [scope] NVARCHAR(1000) NOT NULL CONSTRAINT [consent_renewals_scope_df] DEFAULT 'all',
    [triggered_by] UNIQUEIDENTIFIER,
    [metadata] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [consent_renewals_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [consent_renewals_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[consent_submissions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [visitor_id] NVARCHAR(1000) NOT NULL,
    [authenticated_user_id] UNIQUEIDENTIFIER,
    [policy_version_id] UNIQUEIDENTIFIER,
    [config_version] INT NOT NULL,
    [banner_version] INT,
    [categories] NVARCHAR(max) NOT NULL,
    [vendors] NVARCHAR(max),
    [region] NVARCHAR(1000),
    [language] NVARCHAR(1000),
    [regulation] NVARCHAR(1000),
    [collection_method] NVARCHAR(1000) NOT NULL,
    [event_type] NVARCHAR(1000) NOT NULL CONSTRAINT [consent_submissions_event_type_df] DEFAULT 'INITIAL_CONSENT',
    [consent_status] NVARCHAR(1000) NOT NULL CONSTRAINT [consent_submissions_consent_status_df] DEFAULT 'PARTIAL',
    [checksum] NVARCHAR(1000) NOT NULL,
    [proof_hash] NVARCHAR(1000) NOT NULL,
    [policy_snapshot_hash] NVARCHAR(1000),
    [policy_snapshot] NVARCHAR(max),
    [previous_record_id] UNIQUEIDENTIFIER,
    [user_agent] NVARCHAR(1000),
    [ip_address_hash] NVARCHAR(1000),
    [expires_at] DATETIME2,
    [withdrawn_at] DATETIME2,
    [group_visitor_id] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [consent_submissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [consent_submissions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[domain_scans] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [domain_scans_status_df] DEFAULT 'PENDING',
    [start_url] NVARCHAR(1000) NOT NULL,
    [max_pages] INT NOT NULL CONSTRAINT [domain_scans_max_pages_df] DEFAULT 25,
    [max_depth] INT NOT NULL CONSTRAINT [domain_scans_max_depth_df] DEFAULT 2,
    [include_paths] NVARCHAR(max),
    [exclude_paths] NVARCHAR(max),
    [timeout_ms] INT NOT NULL CONSTRAINT [domain_scans_timeout_ms_df] DEFAULT 30000,
    [js_rendering] BIT NOT NULL CONSTRAINT [domain_scans_js_rendering_df] DEFAULT 1,
    [device_type] NVARCHAR(1000) NOT NULL CONSTRAINT [domain_scans_device_type_df] DEFAULT 'desktop',
    [pages_scanned] INT NOT NULL CONSTRAINT [domain_scans_pages_scanned_df] DEFAULT 0,
    [cookies_found] INT NOT NULL CONSTRAINT [domain_scans_cookies_found_df] DEFAULT 0,
    [trackers_found] INT NOT NULL CONSTRAINT [domain_scans_trackers_found_df] DEFAULT 0,
    [error_message] NVARCHAR(1000),
    [progress_message] NVARCHAR(1000),
    [started_at] DATETIME2,
    [completed_at] DATETIME2,
    [duration_ms] INT,
    [created_by_user_id] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [domain_scans_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [domain_scans_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[domain_scan_pages] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [scan_id] UNIQUEIDENTIFIER NOT NULL,
    [url] NVARCHAR(1000) NOT NULL,
    [canonical_url] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [domain_scan_pages_status_df] DEFAULT 'ok',
    [depth] INT NOT NULL CONSTRAINT [domain_scan_pages_depth_df] DEFAULT 0,
    [error_message] NVARCHAR(1000),
    [scanned_at] DATETIME2 NOT NULL CONSTRAINT [domain_scan_pages_scanned_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [domain_scan_pages_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[domain_scan_findings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [scan_id] UNIQUEIDENTIFIER NOT NULL,
    [page_id] UNIQUEIDENTIFIER,
    [finding_type] NVARCHAR(1000) NOT NULL,
    [consent_state] NVARCHAR(1000) NOT NULL CONSTRAINT [domain_scan_findings_consent_state_df] DEFAULT 'BEFORE_CONSENT',
    [name] NVARCHAR(1000) NOT NULL,
    [value_sample] NVARCHAR(1000),
    [cookie_domain] NVARCHAR(1000),
    [cookie_path] NVARCHAR(1000),
    [expires_at] DATETIME2,
    [secure] BIT,
    [http_only] BIT,
    [same_site] NVARCHAR(1000),
    [is_third_party] BIT,
    [page_url] NVARCHAR(1000),
    [technology] NVARCHAR(1000),
    [source_url] NVARCHAR(1000),
    [metadata] NVARCHAR(max),
    CONSTRAINT [domain_scan_findings_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[cookie_definitions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER,
    [cookie_name] NVARCHAR(1000) NOT NULL,
    [provider] NVARCHAR(1000) NOT NULL,
    [provider_domain] NVARCHAR(1000),
    [description] NVARCHAR(1000),
    [purpose] NVARCHAR(1000),
    [category] NVARCHAR(1000) NOT NULL,
    [duration] NVARCHAR(1000),
    [data_collected] NVARCHAR(1000),
    [is_third_party] BIT NOT NULL CONSTRAINT [cookie_definitions_is_third_party_df] DEFAULT 0,
    [privacy_policy_url] NVARCHAR(1000),
    [risk_level] NVARCHAR(1000) NOT NULL CONSTRAINT [cookie_definitions_risk_level_df] DEFAULT 'MEDIUM',
    [aliases] NVARCHAR(max),
    [detection_patterns] NVARCHAR(max) NOT NULL,
    [is_system] BIT NOT NULL CONSTRAINT [cookie_definitions_is_system_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [cookie_definitions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [cookie_definitions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[domain_cookies] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [cookie_key] NVARCHAR(1000) NOT NULL,
    [cookie_name] NVARCHAR(1000) NOT NULL,
    [cookie_domain] NVARCHAR(1000),
    [provider] NVARCHAR(1000),
    [provider_domain] NVARCHAR(1000),
    [description] NVARCHAR(1000),
    [purpose] NVARCHAR(1000),
    [category] NVARCHAR(1000),
    [duration] NVARCHAR(1000),
    [data_collected] NVARCHAR(1000),
    [is_third_party] BIT,
    [privacy_policy_url] NVARCHAR(1000),
    [risk_level] NVARCHAR(1000),
    [cookie_definition_id] UNIQUEIDENTIFIER,
    [match_method] NVARCHAR(1000),
    [match_confidence] INT,
    [review_status] NVARCHAR(1000) NOT NULL CONSTRAINT [domain_cookies_review_status_df] DEFAULT 'PENDING',
    [first_seen_at] DATETIME2 NOT NULL,
    [last_seen_at] DATETIME2 NOT NULL,
    [last_scan_id] UNIQUEIDENTIFIER,
    [seen_count] INT NOT NULL CONSTRAINT [domain_cookies_seen_count_df] DEFAULT 1,
    [expires_at] DATETIME2,
    [found_before_consent] BIT NOT NULL CONSTRAINT [domain_cookies_found_before_consent_df] DEFAULT 0,
    [source_url] NVARCHAR(1000),
    [metadata] NVARCHAR(max),
    [reviewed_by_user_id] UNIQUEIDENTIFIER,
    [reviewed_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [domain_cookies_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [domain_cookies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [domain_cookies_domain_id_cookie_key_key] UNIQUE NONCLUSTERED ([domain_id],[cookie_key])
);

-- CreateTable
CREATE TABLE [dbo].[blocking_violations] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [url] NVARCHAR(1000) NOT NULL,
    [resource_type] NVARCHAR(1000) NOT NULL,
    [category] NVARCHAR(1000),
    [vendor] NVARCHAR(1000),
    [rule_pattern] NVARCHAR(1000),
    [page_url] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [blocking_violations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [blocking_violations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[notifications] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER,
    [type] NVARCHAR(1000) NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [message] NVARCHAR(1000) NOT NULL,
    [severity] NVARCHAR(1000) NOT NULL CONSTRAINT [notifications_severity_df] DEFAULT 'INFO',
    [read_at] DATETIME2,
    [metadata] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [notifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [notifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[report_schedules] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER,
    [report_type] NVARCHAR(1000) NOT NULL,
    [frequency] NVARCHAR(1000) NOT NULL,
    [delivery_email] NVARCHAR(1000),
    [delivery_webhook] NVARCHAR(1000),
    [enabled] BIT NOT NULL CONSTRAINT [report_schedules_enabled_df] DEFAULT 1,
    [last_run_at] DATETIME2,
    [next_run_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [report_schedules_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [report_schedules_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[report_runs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [schedule_id] UNIQUEIDENTIFIER,
    [report_type] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [result_summary] NVARCHAR(max),
    [delivered_to] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [report_runs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [report_runs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[api_keys] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [key_prefix] NVARCHAR(1000) NOT NULL,
    [key_hash] NVARCHAR(1000) NOT NULL,
    [scopes] NVARCHAR(max) NOT NULL,
    [environment] NVARCHAR(1000) NOT NULL CONSTRAINT [api_keys_environment_df] DEFAULT 'PRODUCTION',
    [last_used_at] DATETIME2,
    [expires_at] DATETIME2,
    [revoked_at] DATETIME2,
    [created_by_user_id] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [api_keys_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [api_keys_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [api_keys_key_hash_key] UNIQUE NONCLUSTERED ([key_hash])
);

-- CreateTable
CREATE TABLE [dbo].[webhook_endpoints] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [url] NVARCHAR(1000) NOT NULL,
    [secret] NVARCHAR(1000) NOT NULL,
    [secret_prefix] NVARCHAR(1000) NOT NULL,
    [events] NVARCHAR(max) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [webhook_endpoints_enabled_df] DEFAULT 1,
    [description] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [webhook_endpoints_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [webhook_endpoints_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[webhook_deliveries] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [webhook_endpoint_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [event_type] NVARCHAR(1000) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [webhook_deliveries_status_df] DEFAULT 'PENDING',
    [attempt_count] INT NOT NULL CONSTRAINT [webhook_deliveries_attempt_count_df] DEFAULT 0,
    [last_attempt_at] DATETIME2,
    [next_retry_at] DATETIME2,
    [response_status] INT,
    [response_body] NVARCHAR(1000),
    [error_message] NVARCHAR(1000),
    [delivered_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [webhook_deliveries_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [webhook_deliveries_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[api_idempotency_keys] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [api_key_id] UNIQUEIDENTIFIER,
    [idempotency_key] NVARCHAR(1000) NOT NULL,
    [method] NVARCHAR(1000) NOT NULL,
    [path] NVARCHAR(1000) NOT NULL,
    [status_code] INT NOT NULL,
    [response_body] NVARCHAR(max) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [api_idempotency_keys_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [expires_at] DATETIME2 NOT NULL,
    CONSTRAINT [api_idempotency_keys_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [api_idempotency_keys_organization_id_idempotency_key_key] UNIQUE NONCLUSTERED ([organization_id],[idempotency_key])
);

-- CreateTable
CREATE TABLE [dbo].[domain_groups] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [share_consent] BIT NOT NULL CONSTRAINT [domain_groups_share_consent_df] DEFAULT 1,
    [consent_sync_secret] NVARCHAR(1000) NOT NULL,
    [parent_domain_id] UNIQUEIDENTIFIER,
    [allowed_hostnames] NVARCHAR(max) NOT NULL CONSTRAINT [domain_groups_allowed_hostnames_df] DEFAULT '[]',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [domain_groups_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [domain_groups_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [domain_groups_organization_id_slug_key] UNIQUE NONCLUSTERED ([organization_id],[slug])
);

-- CreateTable
CREATE TABLE [dbo].[domain_group_members] (
    [group_id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [role] NVARCHAR(1000) NOT NULL CONSTRAINT [domain_group_members_role_df] DEFAULT 'member',
    CONSTRAINT [domain_group_members_pkey] PRIMARY KEY CLUSTERED ([group_id],[domain_id])
);

-- CreateTable
CREATE TABLE [dbo].[organization_custom_roles] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [permissions] NVARCHAR(max) NOT NULL CONSTRAINT [organization_custom_roles_permissions_df] DEFAULT '[]',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [organization_custom_roles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [organization_custom_roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [organization_custom_roles_organization_id_slug_key] UNIQUE NONCLUSTERED ([organization_id],[slug])
);

-- CreateTable
CREATE TABLE [dbo].[user_custom_roles] (
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [custom_role_id] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [user_custom_roles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_custom_roles_pkey] PRIMARY KEY CLUSTERED ([user_id],[custom_role_id])
);

-- CreateTable
CREATE TABLE [dbo].[user_domain_access] (
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [permissions] NVARCHAR(max) NOT NULL CONSTRAINT [user_domain_access_permissions_df] DEFAULT '[]',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [user_domain_access_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [user_domain_access_pkey] PRIMARY KEY CLUSTERED ([user_id],[domain_id])
);

-- CreateTable
CREATE TABLE [dbo].[ai_suggestions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [suggestion_type] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ai_suggestions_status_df] DEFAULT 'PENDING',
    [target_type] NVARCHAR(1000) NOT NULL,
    [target_id] UNIQUEIDENTIFIER,
    [confidence] FLOAT(53),
    [suggestion] NVARCHAR(max) NOT NULL,
    [evidence] NVARCHAR(max),
    [created_by] NVARCHAR(1000),
    [decided_by] UNIQUEIDENTIFIER,
    [decided_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [ai_suggestions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [ai_suggestions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[regression_test_runs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [domain_id] UNIQUEIDENTIFIER NOT NULL,
    [overall_status] NVARCHAR(1000) NOT NULL,
    [scenarios] NVARCHAR(max) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [regression_test_runs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [regression_test_runs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [organizations_status_idx] ON [dbo].[organizations]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_organization_id_idx] ON [dbo].[users]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_status_idx] ON [dbo].[users]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [permissions_module_idx] ON [dbo].[permissions]([module]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [refresh_tokens_user_id_idx] ON [dbo].[refresh_tokens]([user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [refresh_tokens_expires_at_idx] ON [dbo].[refresh_tokens]([expires_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [login_history_user_id_created_at_idx] ON [dbo].[login_history]([user_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [email_verification_tokens_user_id_idx] ON [dbo].[email_verification_tokens]([user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [password_reset_tokens_user_id_idx] ON [dbo].[password_reset_tokens]([user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_organization_id_created_at_idx] ON [dbo].[audit_logs]([organization_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_user_id_created_at_idx] ON [dbo].[audit_logs]([user_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_module_action_idx] ON [dbo].[audit_logs]([module], [action]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domains_organization_id_idx] ON [dbo].[domains]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domains_verification_status_idx] ON [dbo].[domains]([verification_status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domains_scan_frequency_next_scan_at_idx] ON [dbo].[domains]([scan_frequency], [next_scan_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [installation_validations_domain_id_created_at_idx] ON [dbo].[installation_validations]([domain_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [consent_categories_domain_id_sort_order_idx] ON [dbo].[consent_categories]([domain_id], [sort_order]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [policy_versions_domain_id_status_idx] ON [dbo].[policy_versions]([domain_id], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [consent_renewals_domain_id_created_at_idx] ON [dbo].[consent_renewals]([domain_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [consent_submissions_organization_id_created_at_idx] ON [dbo].[consent_submissions]([organization_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [consent_submissions_domain_id_visitor_id_created_at_idx] ON [dbo].[consent_submissions]([domain_id], [visitor_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [consent_submissions_domain_id_created_at_idx] ON [dbo].[consent_submissions]([domain_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [consent_submissions_proof_hash_idx] ON [dbo].[consent_submissions]([proof_hash]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [consent_submissions_group_visitor_id_created_at_idx] ON [dbo].[consent_submissions]([group_visitor_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_scans_domain_id_created_at_idx] ON [dbo].[domain_scans]([domain_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_scans_organization_id_created_at_idx] ON [dbo].[domain_scans]([organization_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_scan_pages_scan_id_idx] ON [dbo].[domain_scan_pages]([scan_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_scan_findings_scan_id_finding_type_idx] ON [dbo].[domain_scan_findings]([scan_id], [finding_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [cookie_definitions_organization_id_idx] ON [dbo].[cookie_definitions]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [cookie_definitions_cookie_name_idx] ON [dbo].[cookie_definitions]([cookie_name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_cookies_domain_id_review_status_idx] ON [dbo].[domain_cookies]([domain_id], [review_status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_cookies_organization_id_idx] ON [dbo].[domain_cookies]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [blocking_violations_domain_id_created_at_idx] ON [dbo].[blocking_violations]([domain_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_organization_id_created_at_idx] ON [dbo].[notifications]([organization_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_organization_id_read_at_idx] ON [dbo].[notifications]([organization_id], [read_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [report_schedules_organization_id_idx] ON [dbo].[report_schedules]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [report_runs_organization_id_created_at_idx] ON [dbo].[report_runs]([organization_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [api_keys_organization_id_created_at_idx] ON [dbo].[api_keys]([organization_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [webhook_endpoints_organization_id_created_at_idx] ON [dbo].[webhook_endpoints]([organization_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [webhook_deliveries_webhook_endpoint_id_created_at_idx] ON [dbo].[webhook_deliveries]([webhook_endpoint_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [webhook_deliveries_organization_id_created_at_idx] ON [dbo].[webhook_deliveries]([organization_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [api_idempotency_keys_expires_at_idx] ON [dbo].[api_idempotency_keys]([expires_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_groups_organization_id_idx] ON [dbo].[domain_groups]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [domain_group_members_domain_id_idx] ON [dbo].[domain_group_members]([domain_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [organization_custom_roles_organization_id_idx] ON [dbo].[organization_custom_roles]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [user_domain_access_domain_id_idx] ON [dbo].[user_domain_access]([domain_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ai_suggestions_domain_id_status_idx] ON [dbo].[ai_suggestions]([domain_id], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ai_suggestions_organization_id_created_at_idx] ON [dbo].[ai_suggestions]([organization_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [regression_test_runs_domain_id_created_at_idx] ON [dbo].[regression_test_runs]([domain_id], [created_at]);

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_role_id_fkey] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_role_id_fkey] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_permission_id_fkey] FOREIGN KEY ([permission_id]) REFERENCES [dbo].[permissions]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[refresh_tokens] ADD CONSTRAINT [refresh_tokens_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[login_history] ADD CONSTRAINT [login_history_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[email_verification_tokens] ADD CONSTRAINT [email_verification_tokens_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[password_reset_tokens] ADD CONSTRAINT [password_reset_tokens_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[domains] ADD CONSTRAINT [domains_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[installation_validations] ADD CONSTRAINT [installation_validations_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[consent_categories] ADD CONSTRAINT [consent_categories_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[policy_versions] ADD CONSTRAINT [policy_versions_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[consent_renewals] ADD CONSTRAINT [consent_renewals_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[consent_renewals] ADD CONSTRAINT [consent_renewals_policy_version_id_fkey] FOREIGN KEY ([policy_version_id]) REFERENCES [dbo].[policy_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[consent_submissions] ADD CONSTRAINT [consent_submissions_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[domain_scans] ADD CONSTRAINT [domain_scans_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[domain_scan_pages] ADD CONSTRAINT [domain_scan_pages_scan_id_fkey] FOREIGN KEY ([scan_id]) REFERENCES [dbo].[domain_scans]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[domain_scan_findings] ADD CONSTRAINT [domain_scan_findings_scan_id_fkey] FOREIGN KEY ([scan_id]) REFERENCES [dbo].[domain_scans]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[domain_scan_findings] ADD CONSTRAINT [domain_scan_findings_page_id_fkey] FOREIGN KEY ([page_id]) REFERENCES [dbo].[domain_scan_pages]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[domain_cookies] ADD CONSTRAINT [domain_cookies_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[domain_cookies] ADD CONSTRAINT [domain_cookies_cookie_definition_id_fkey] FOREIGN KEY ([cookie_definition_id]) REFERENCES [dbo].[cookie_definitions]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[blocking_violations] ADD CONSTRAINT [blocking_violations_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[report_schedules] ADD CONSTRAINT [report_schedules_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[report_runs] ADD CONSTRAINT [report_runs_schedule_id_fkey] FOREIGN KEY ([schedule_id]) REFERENCES [dbo].[report_schedules]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[api_keys] ADD CONSTRAINT [api_keys_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[webhook_endpoints] ADD CONSTRAINT [webhook_endpoints_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[webhook_deliveries] ADD CONSTRAINT [webhook_deliveries_webhook_endpoint_id_fkey] FOREIGN KEY ([webhook_endpoint_id]) REFERENCES [dbo].[webhook_endpoints]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[domain_groups] ADD CONSTRAINT [domain_groups_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[domain_group_members] ADD CONSTRAINT [domain_group_members_group_id_fkey] FOREIGN KEY ([group_id]) REFERENCES [dbo].[domain_groups]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[domain_group_members] ADD CONSTRAINT [domain_group_members_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[organization_custom_roles] ADD CONSTRAINT [organization_custom_roles_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[user_custom_roles] ADD CONSTRAINT [user_custom_roles_custom_role_id_fkey] FOREIGN KEY ([custom_role_id]) REFERENCES [dbo].[organization_custom_roles]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[user_custom_roles] ADD CONSTRAINT [user_custom_roles_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_domain_access] ADD CONSTRAINT [user_domain_access_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[user_domain_access] ADD CONSTRAINT [user_domain_access_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ai_suggestions] ADD CONSTRAINT [ai_suggestions_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[regression_test_runs] ADD CONSTRAINT [regression_test_runs_domain_id_fkey] FOREIGN KEY ([domain_id]) REFERENCES [dbo].[domains]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

