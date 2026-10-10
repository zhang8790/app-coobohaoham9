# 数据库迁移文件归类索引（共 244 个）

> 本目录为历史迁移归档。活跃迁移目录 `supabase/migrations/` 已清空（避免 `supabase db push` 重放全部 244 个迁移导致中断）。
> 单一事实源的当前结构 = 远程线上库；本索引 + 上级 `schema.sql`（244 文件按文件名顺序合并）用于管理与备份。

## 商品(product/category/food/therapy/ingredient/stock/barcode/coupon/tongue) — 56 个

- `00007_add_withdrawals_and_barcode.sql`
- `00008_add_addresses_favorites_footprint_reviews_coupons.sql`
- `00009_add_product_review_status_and_admin_rls.sql`
- `00010_add_product_new_fields.sql`
- `00022_fix_products_fields.sql`
- `00039_extend_coupons_for_merchant.sql`
- `00050_add_product_emotion_dimension_fields.sql`
- `00056_enhance_product_mood_dimensions.sql`
- `00070_shiyang_ingredients.sql`
- `00071_sync_category_emotion_profiles.sql`
- `00081_production_rls_hardening.sql`
- `00090_products_ingredients.sql`
- `00093_merchant_product_write_policy.sql`
- `00094_product_emotion_merchant_write_policy.sql`
- `00100_food_therapy_fields.sql`
- `00102_food_therapy_templates.sql`
- `00103_food_therapy_feedback.sql`
- `00104_food_therapy_v2_fields.sql`
- `00107_auto_tag_products.sql`
- `00138_fix_get_nearby_products_is_platform.sql`
- `00139_coupons_table.sql`
- `00140_coupons_claim_redeem.sql`
- `00200_food_ingredient_safety.sql`
- `00202_create_product_images_bucket.sql`
- `00203_expand_food_additives_seed.sql`
- `00204_product_label_safety_fields.sql`
- `00212_add_category_active_and_seed.sql`
- `00220_food_safety_libs.sql`
- `00221_product_sales_count.sql`
- `00223_fn_merchant_product_sales.sql`
- `00223_food_ingredients.sql`
- `00224_upgrade_additives_l1l4.sql`
- `00225_food_tag_rules.sql`
- `00227_tongue_cases.sql`
- `00237_product_fit_constitution.sql`
- `00238_food_homology_and_backfill.sql`
- `00239_medicinal_food_catalog_backfill_106.sql`
- `20260730_add_food_stage.sql`
- `20260801_product_therapy_json.sql`
- `20260801e_product_feed_rank.sql`
- `20260802_medicinal_food_catalog.sql`
- `20260802_product_subjects.sql`
- `20260802_store_food_profile_sync.sql`
- `20260803_product_kind.sql`
- `20260804_barcode_feature.sql`
- `20260916c_ensure_barcode_prefix.sql`
- `20260924_add_category_icon.sql`
- `20260924_add_products_spec.sql`
- `20260926_store_barcodes_ledger.sql`
- `20260927_add_category_parent.sql`
- `20260927_cleanup_unclassified_products.sql`
- `20261008a_food_categories.sql`
- `20261008b_ingredient_candidates.sql`
- `20261009_fix_category_tree_cleanup.sql`
- `20261009_global_categories_product_standard.sql`
- `20261010_add_enable_therapy.sql`

## 其他(未分类) — 46 个

- `00001_init_schema.sql`
- `00005_add_referral_and_service_type.sql`
- `00017_liquidity_distributation.sql`
- `00026_add_is_platform.sql`
- `00030_all_tables_missing_columns.sql`
- `00034_articles_add_view_share_count.sql`
- `00035_add_pending_referrals.sql`
- `00049_remove_team_performance.sql`
- `00055_add_ship_and_verify_columns.sql`
- `00059_pipi_privacy_consent.sql`
- `00074_add_body_templates.sql`
- `00076_create_gold_bean_logs.sql`
- `00080_atomic_rpc_indexes_unique.sql`
- `00084_notifications_table.sql`
- `00109_create_videos_bucket.sql`
- `00136_reconcile_00135_double_exec.sql`
- `00139_add_partner_brand_to_nearby.sql`
- `00201_reclassify_partner_to_self.sql`
- `00204_drop_redundant_config_tables.sql`
- `00208_drop_junk_objects.sql`
- `00210_add_articles_status_cover_video.sql`
- `00210_drop_legacy_permissive_policies.sql`
- `00211_add_articles_images.sql`
- `00213_expiry_engine_data.sql`
- `00216_article_social.sql`
- `00217_season_reminder.sql`
- `00218_cart_items_batch_id.sql`
- `00219_schedule_expiry_engine.sql`
- `00221_add_ops_observability.sql`
- `00221_crowd_severity.sql`
- `00222_sales_accum_triggers.sql`
- `00222_schedule_ops_jobs.sql`
- `00224_ensure_qr_buckets.sql`
- `00235_article_social_enhance.sql`
- `00236_article_lock_customer.sql`
- `00237_referrer_source_and_favorite_referral.sql`
- `00240_snack_crowd_rules.sql`
- `20260731_article_share_codes.sql`
- `20260801b_deactivate_henglongpu.sql`
- `20260801c_p0_resilience.sql`
- `20260802_self_operated_unified_rbac.sql`
- `20260804_site_configs.sql`
- `20260921_global_categories_scene.sql`
- `20260926_schema_drift_tables.sql`
- `20260927_rename_scenes_to_replica.sql`
- `回滚_类目图标_2026-09-24.sql`

## 订单(order/refund/commission/withdraw/settle/payment) — 36 个

- `00003_add_commission_points_system.sql`
- `00004_add_refunds_table.sql`
- `00012_v4_commission_fields.sql`
- `00020_add_order_items_created_at.sql`
- `00027_fix_orders_for_create.sql`
- `00029_add_orders_missing_columns.sql`
- `00031_refunds_full_fix.sql`
- `00032_drop_refunds_check.sql`
- `00044_redpacket_payouts.sql`
- `00047_harden_redpacket_payouts.sql`
- `00058_separate_commission_and_points.sql`
- `00061_add_order_status_pending_pickup.sql`
- `00077_add_withdrawal_identity.sql`
- `00082_orders_channel_fee.sql`
- `00083_commission_channel_fee_tax.sql`
- `00094_buyer_order_write_policy.sql`
- `00108_add_commission_distributed_to_orders.sql`
- `00116_fix_withdrawals_columns.sql`
- `00122_fix_settle_order_tb_portion.sql`
- `00123_saved_withdrawal_accounts.sql`
- `00126_add_commission_earn_to_tongbao_logs.sql`
- `00131_relax_settle_status.sql`
- `00132_order_feed_rpc.sql`
- `00134_commissions_idempotent_unique.sql`
- `00135_backfill_2_pending_commission.sql`
- `00136_commission_split_and_ledger.sql`
- `00242_schema_drift_withdrawals_commissions_profiles.sql`
- `20260720_add_order_item_commissions.sql`
- `20260720_add_orders_effective_rate_commission_error.sql`
- `20260720_order_item_commissions_refund.sql`
- `20260728_commission_risk.sql`
- `20260804_cleanup_withdrawals_rls81.sql`
- `20260804_cleanup_withdrawals_rls81_ownerread.sql`
- `20260804_hotfix_withdrawals_rls.sql`
- `20260804_order_printed_at.sql`
- `20260804_order_printed_backfill.sql`

## 门店(store/staff/invite/vehicle/printer/merchant) — 36 个

- `00006_add_store_short_code.sql`
- `00016_referral_and_staff.sql`
- `00019_add_orders_store_id.sql`
- `00043_fix_claim_campaign_store_id_type.sql`
- `00046_fix_claims_store_id_and_rpc.sql`
- `00048_merchant_members_masked.sql`
- `00120_merchant_settlement.sql`
- `00121_fix_merchant_payout_allocation.sql`
- `00124_add_self_operated_store.sql`
- `00125_add_store_referral_rate_enabled.sql`
- `00127_fix_merchant_applications_rls.sql`
- `00132_merchant_settlements_owner_rls.sql`
- `00133_merchant_order_summary_rpc.sql`
- `00138_merchant_path_isolation.sql`
- `00141_merchant_operator_write_rls.sql`
- `00142_self_open_store.sql`
- `00203_drop_user_staff_bindings.sql`
- `00205_invite_p0_hardening.sql`
- `00206_invite_functions_v2.sql`
- `00225_fn_merchant_analytics.sql`
- `00226_merchant_rpc_membership_guard.sql`
- `00238_clamp_store_referral_rate.sql`
- `00239_ensure_store_short_codes.sql`
- `20260705_fix_user_store_relation_schema.sql`
- `20260726_store_categories_global.sql`
- `20260726_store_categories_global_idempotent.sql`
- `20260801d_p1_store_location_cache.sql`
- `20260802b_vehicle_store_isolation.sql`
- `20260802c_store_invites.sql`
- `20260802d_merchant_apply_address.sql`
- `20260802e_merchant_apply_simplify.sql`
- `20260803_printer_configs.sql`
- `20260916_delete_test_stores.sql`
- `20260916_fix_store_is_platform.sql`
- `20260916_restore_stores.sql`
- `20260917_fix_merchant_approval_store.sql`

## 情绪健康(emotion/mood/constitution/health/symptom/tongbao/claim) — 21 个

- `00038_emotion_system.sql`
- `00040_emotion_llm_system.sql`
- `00041_user_emotion_preferences.sql`
- `00042_add_claimed_at_to_campaign_claims.sql`
- `00051_create_emotion_funnel_events.sql`
- `00052_create_emotion_claims.sql`
- `00053_create_emotion_assets_and_badges.sql`
- `00054_emotion_rollback_and_rules.sql`
- `00057_emotion_lexicon.sql`
- `00062_disable_rls_emotion_funnel_events.sql`
- `00072_fix_emotion_rls.sql`
- `00073_seed_emo_badge_defs.sql`
- `00078_fix_claim_tongbao_type_and_bean_logs_rls.sql`
- `00096_merge_goldbeans_to_tongbao.sql`
- `00101_symptom_rules.sql`
- `00105_profile_constitution.sql`
- `00124_fix_tongbao_logs_balance_after_numeric.sql`
- `00205_user_health_profile.sql`
- `20260705_update_claim_campaign_with_lock.sql`
- `20260729_emotion_badge_grants_owner_write.sql`
- `20260804_constitution_results.sql`

## 噪声/补丁/临时(noise/patch/merge/tmp/fix/rollback/cleanup/test/set/disable/check/completion/backfill/seed/backup/trigger_log/audit/error/log) — 17 个

- `00002_seed_data.sql`
- `00015_db_completion.sql`
- `00021_merge_patch.sql`
- `00023_full_patch.sql`
- `00024_fix_image_storage.sql`
- `00025_set_test_image.sql`
- `00033_check_all_tables.sql`
- `00037_cleanup_unused_tables.sql`
- `00091_fix_seed_image_cdn.sql`
- `00097_fix_tb_used_over_deduction.sql`
- `00113_fix_referral_binding_referrer_id.sql`
- `00123_fix_legacy_tb_used_unit.sql`
- `00212_drop_tmp_backup_tables.sql`
- `00214_expiry_engine_fix.sql`
- `00220_fix_trigger_discount_rate.sql`
- `00226_seed_cities_full.sql`
- `20260924_cleanup_pending_referrals.sql`

## 用户(user/profile/login/address/family/identity) — 11 个

- `00045_add_profiles_openid.sql`
- `00060_ensure_profiles_cv_tb.sql`
- `00087_profiles_allow_behavior_analysis.sql`
- `00107_fix_handle_new_user_trigger.sql`
- `00133_profiles_downline_read.sql`
- `00134_profiles_downline_read_fix.sql`
- `00211_user_login_identities.sql`
- `00226_user_pref_tags.sql`
- `00241_profiles_avatar_url_and_avatars_bucket.sql`
- `20260802_family_archive.sql`
- `20260916_add_address_coords.sql`

## RLS/权限(rls/policy/role/permission/grant) — 8 个

- `00028_disable_all_rls.sql`
- `00092_bootstrap_admin_role.sql`
- `00095_consolidated_rls_final.sql`
- `00115_fix_profiles_rls_downline_read.sql`
- `00207_fix_rls_zero_policy_tables.sql`
- `00209_enable_rls_on_unprotected_tables.sql`
- `00213_admin_password_toggle.sql`
- `20260731_articles_self_rls.sql`

## 营销(marketing/campaign/announcement/redpacket/points/rank) — 8 个

- `00036_check_and_fix_marketing_campaigns.sql`
- `00075_disable_points_logs_rls.sql`
- `00085_merge_points_to_gold_beans.sql`
- `00086_member_rank_events.sql`
- `00106_consolidate_get_rank_progress.sql`
- `00108_rename_member_ranks.sql`
- `00137_reconcile_l2_buyer_points_part1.sql`
- `00137_reconcile_l2_buyer_points_part2.sql`

## LLM/AI(llm/ocr/analyze/vision) — 3 个

- `00215_expiry_decided_by_constraint.sql`
- `20260726_system_llm_config.sql`
- `20260731_llm_call_logs.sql`

## 打印/小票(print/receipt) — 2 个

- `00018_fix_favorites_footprints_cart.sql`
- `20260803_print_receipt_trigger.sql`

