-- ============================================================
-- SECTION: SCHEMA
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

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
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";


--
-- Name: EXTENSION "pg_graphql"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_graphql" IS 'pg_graphql: GraphQL support';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


--
-- Name: EXTENSION "supabase_vault"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "supabase_vault" IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: member_rank; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'member_rank'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."member_rank" AS ENUM (
    '江湖散修',
    '外门弟子',
    '内门弟子',
    '核心弟子',
    '长老',
    '掌门'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: merchant_status; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'merchant_status'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."merchant_status" AS ENUM (
    'none',
    'pending',
    'approved',
    'rejected'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'order_status'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."order_status" AS ENUM (
    'pending_pay',
    'pending_ship',
    'pending_receive',
    'pending_review',
    'completed',
    'after_sale',
    'cancelled'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'payment_method'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."payment_method" AS ENUM (
    'wxpay',
    'gold_beans'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: refund_status; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'refund_status'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."refund_status" AS ENUM (
    'pending_review',
    'processing',
    'completed',
    'closed',
    'abnormal'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_type; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'service_type'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."service_type" AS ENUM (
    'dine_in',
    'self_pickup',
    'delivery'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: bind_referrer("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."bind_referrer"("p_referral_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_referrer RECORD;
  v_self_code text;
BEGIN
  -- 查自己的推广码，避免自绑
  SELECT referral_code INTO v_self_code FROM public.profiles WHERE id = auth.uid();
  IF v_self_code = upper(trim(p_referral_code)) THEN
    RETURN jsonb_build_object('success', false, 'error', '不能绑定自己的推广码');
  END IF;

  -- 查推广人
  SELECT id, referral_code INTO v_referrer FROM public.profiles WHERE referral_code = upper(trim(p_referral_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '推广码不存在');
  END IF;

  -- 幂等：已绑定则跳过
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND referrer_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', true, 'message', '已绑定');
  END IF;

  UPDATE public.profiles SET referrer_id = v_referrer.id WHERE id = auth.uid();
  RETURN jsonb_build_object('success', true, 'referrer_id', v_referrer.id);
END;
$$;


--
-- Name: generate_order_no(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."generate_order_no"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.order_no := 'LS' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0');
  RETURN NEW;
END;
$$;


--
-- Name: generate_store_short_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."generate_store_short_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
  attempts int := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    -- 检查唯一性
    IF NOT EXISTS (SELECT 1 FROM stores WHERE short_code = code) THEN
      RETURN code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 100 THEN RAISE EXCEPTION 'Failed to generate unique short_code'; END IF;
  END LOOP;
END;
$$;


--
-- Name: get_rank_progress("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_rank_progress"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_profile RECORD;
  v_direct_count int;
  v_total_gmv numeric;
  v_next_rank text;
  v_progress numeric;
  v_target int;
BEGIN
  SELECT member_rank, points, balance INTO v_profile FROM public.profiles WHERE id = p_user_id;
  -- 统计直接下级数
  SELECT count(*) INTO v_direct_count FROM public.profiles WHERE referrer_id = p_user_id;
  -- 统计个人GMV（已完成订单）
  SELECT COALESCE(sum(total_amount), 0) INTO v_total_gmv FROM public.orders
  WHERE user_id = p_user_id AND status NOT IN ('cancelled', 'after_sale');

  -- 段位进度规则（简化版）
  CASE v_profile.member_rank
    WHEN '江湖散修' THEN v_next_rank := '外门弟子'; v_target := 3; v_progress := LEAST(v_direct_count::numeric / 3, 1);
    WHEN '外门弟子' THEN v_next_rank := '内门弟子'; v_target := 10; v_progress := LEAST(v_direct_count::numeric / 10, 1);
    WHEN '内门弟子' THEN v_next_rank := '核心弟子'; v_target := 30; v_progress := LEAST(v_direct_count::numeric / 30, 1);
    WHEN '核心弟子' THEN v_next_rank := '长老'; v_target := 100; v_progress := LEAST(v_direct_count::numeric / 100, 1);
    WHEN '长老' THEN v_next_rank := '掌门'; v_target := 300; v_progress := LEAST(v_direct_count::numeric / 300, 1);
    ELSE v_next_rank := '已是最高段位'; v_target := 0; v_progress := 1;
  END CASE;

  RETURN jsonb_build_object(
    'current_rank', v_profile.member_rank,
    'next_rank', v_next_rank,
    'direct_count', v_direct_count,
    'target_count', v_target,
    'progress', v_progress,
    'total_gmv', v_total_gmv,
    'points', v_profile.points,
    'balance', v_profile.balance
  );
END;
$$;


--
-- Name: get_refundable_amount("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_refundable_amount"("p_order_id" "uuid", "p_item_index" integer) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order RECORD;
  v_item jsonb;
  v_subtotal numeric;
  v_refunded numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- p_item_index = -1 表示整单
  IF p_item_index < 0 THEN
    v_subtotal := v_order.total_amount;
    v_refunded := COALESCE(v_order.refunded_amount, 0);
  ELSE
    v_item := (v_order.items->p_item_index);
    v_subtotal := COALESCE((v_item->>'subtotal')::numeric, 0);
    v_refunded := COALESCE((v_item->>'refunded_amount')::numeric, 0);
  END IF;

  RETURN GREATEST(v_subtotal - v_refunded, 0);
END;
$$;


--
-- Name: get_user_role("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_user_role"("uid" "uuid") RETURNS "public"."user_role"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username, phone, nickname, role, openid)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'username')::text,
    NEW.phone,
    COALESCE((NEW.raw_user_meta_data->>'nickname')::text, '江湖散修'),
    'user'::public.user_role,
    (NEW.raw_user_meta_data->>'openid')::text
  );
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user_referral(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user_referral"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_product_pending_on_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."set_product_pending_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.review_status IS NULL OR NEW.review_status = 'approved' THEN
    NEW.review_status := 'pending';
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_product_active_on_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."sync_product_active_on_review"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.review_status = 'approved' THEN
    NEW.is_active := true;
  ELSIF NEW.review_status = 'rejected' THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_order_refunded_amount("uuid", numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_order_refunded_amount"("p_order_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.orders
  SET refunded_amount = COALESCE(refunded_amount, 0) + p_amount,
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "content" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."articles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "images" "text"[] DEFAULT '{}'::"text"[],
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "is_published" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "cover_image" "text"
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."cart_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "selected" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cart_items_quantity_check" CHECK (("quantity" > 0))
);


--
-- Name: commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."commissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "order_no" "text" NOT NULL,
    "beneficiary_id" "uuid" NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "level" integer NOT NULL,
    "rank_at_time" "text" NOT NULL,
    "ratio" numeric(6,4) NOT NULL,
    "pool_amount" numeric(12,4) NOT NULL,
    "commission_amount" numeric(12,4) NOT NULL,
    "b_coef" numeric(6,4) DEFAULT 1.0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "settle_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commissions_level_check" CHECK (("level" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "commissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'settled'::"text", 'refunded'::"text"])))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "title" "text" NOT NULL,
    "discount_type" "text" DEFAULT 'amount'::"text" NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "min_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_used" boolean DEFAULT false NOT NULL,
    "expired_at" timestamp with time zone,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coupons_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['amount'::"text", 'percent'::"text"])))
);


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: footprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."footprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: merchant_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."merchant_applications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "store_name" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "contact_phone" "text" NOT NULL,
    "business_type" "text" DEFAULT '餐饮'::"text" NOT NULL,
    "description" "text",
    "status" "public"."merchant_status" DEFAULT 'pending'::"public"."merchant_status" NOT NULL,
    "reject_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "store_id" "uuid",
    "store_name" "text",
    "product_name" "text" NOT NULL,
    "product_image" "text",
    "price" numeric(10,2) NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_no" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "total_amount" numeric(10,2) NOT NULL,
    "status" "public"."order_status" DEFAULT 'pending_pay'::"public"."order_status" NOT NULL,
    "payment_method" "public"."payment_method",
    "pay_expired_at" timestamp with time zone DEFAULT ("now"() + '00:30:00'::interval),
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gold_beans_used" numeric(12,4) DEFAULT 0 NOT NULL,
    "referrer_id" "uuid",
    "commission_distributed" boolean DEFAULT false NOT NULL,
    "service_type" "public"."service_type" DEFAULT 'delivery'::"public"."service_type" NOT NULL
);


--
-- Name: points_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."points_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "order_id" "uuid",
    "type" "text" NOT NULL,
    "delta" integer NOT NULL,
    "balance_after" integer NOT NULL,
    "remark" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "points_logs_type_check" CHECK (("type" = ANY (ARRAY['purchase_earn'::"text", 'invite_earn'::"text", 'checkin_earn'::"text", 'ugc_earn'::"text", 'redeem_spend'::"text", 'pay_spend'::"text", 'lottery_spend'::"text", 'refund_deduct'::"text"])))
);


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."product_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "order_id" "uuid",
    "order_item_id" "uuid",
    "rating" smallint DEFAULT 5 NOT NULL,
    "content" "text",
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2) NOT NULL,
    "original_price" numeric(10,2),
    "image_url" "text",
    "stock" integer DEFAULT 999 NOT NULL,
    "mood_tags" "text"[] DEFAULT '{}'::"text"[],
    "scene_tags" "text"[] DEFAULT '{}'::"text"[],
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "barcode" "text",
    "review_status" "text" DEFAULT 'approved'::"text" NOT NULL,
    CONSTRAINT "products_review_status_check" CHECK (("review_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "phone" "text",
    "nickname" "text" DEFAULT '江湖散修'::"text" NOT NULL,
    "avatar_url" "text",
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "openid" "text",
    "member_rank" "public"."member_rank" DEFAULT '江湖散修'::"public"."member_rank" NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "balance" numeric(10,2) DEFAULT 0 NOT NULL,
    "coupons_count" integer DEFAULT 0 NOT NULL,
    "merchant_status" "public"."merchant_status" DEFAULT 'none'::"public"."merchant_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "referral_code" "text",
    "referrer_id" "uuid"
);


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "refund_no" "text",
    "order_id" "uuid" NOT NULL,
    "order_no" "text" NOT NULL,
    "item_index" integer DEFAULT 0 NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "initiated_by" "text" DEFAULT 'user'::"text" NOT NULL,
    "status" "public"."refund_status" DEFAULT 'pending_review'::"public"."refund_status" NOT NULL,
    "refund_quantity" integer DEFAULT 1 NOT NULL,
    "refund_amount" numeric(12,4) NOT NULL,
    "reason" "text",
    "description" "text",
    "wechat_refund_id" "text",
    "version" integer DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "refunds_initiated_by_check" CHECK (("initiated_by" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


--
-- Name: store_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."store_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."stores" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "address" "text",
    "phone" "text",
    "category" "text" DEFAULT '综合'::"text" NOT NULL,
    "image_url" "text",
    "banner_url" "text",
    "rating" numeric(3,1) DEFAULT 5.0,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "short_code" "text" DEFAULT "public"."generate_store_short_code"()
);


--
-- Name: user_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "province" "text",
    "city" "text",
    "district" "text",
    "detail" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."withdrawals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "store_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "bank_name" "text",
    "bank_account" "text",
    "bank_holder" "text",
    "alipay_account" "text",
    "withdraw_method" "text" DEFAULT 'bank'::"text" NOT NULL,
    "reject_reason" "text",
    "remark" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "withdrawals_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "withdrawals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'paid'::"text"]))),
    CONSTRAINT "withdrawals_withdraw_method_check" CHECK (("withdraw_method" = ANY (ARRAY['bank'::"text", 'alipay'::"text", 'wechat'::"text"])))
);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'announcements_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'announcements'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'articles_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'articles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'cart_items_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'cart_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: cart_items cart_items_user_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'cart_items_user_id_product_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'cart_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_user_id_product_id_key" UNIQUE ("user_id", "product_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'commissions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'commissions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'coupons_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'favorites_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'favorites'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: favorites favorites_user_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'favorites_user_id_product_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'favorites'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_product_id_key" UNIQUE ("user_id", "product_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: footprints footprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'footprints_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'footprints'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."footprints"
    ADD CONSTRAINT "footprints_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: footprints footprints_user_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'footprints_user_id_product_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'footprints'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."footprints"
    ADD CONSTRAINT "footprints_user_id_product_id_key" UNIQUE ("user_id", "product_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: merchant_applications merchant_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'merchant_applications_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'merchant_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."merchant_applications"
    ADD CONSTRAINT "merchant_applications_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_items_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_order_no_key'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_no_key" UNIQUE ("order_no");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: points_logs points_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'points_logs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'points_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."points_logs"
    ADD CONSTRAINT "points_logs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_reviews_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_referral_code_key'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referral_code_key" UNIQUE ("referral_code");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'refunds_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'refunds'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: refunds refunds_refund_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'refunds_refund_no_key'
      AND n.nspname = 'public'
      AND c.relname = 'refunds'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_refund_no_key" UNIQUE ("refund_no");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: store_categories store_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'store_categories_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'store_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."store_categories"
    ADD CONSTRAINT "store_categories_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'stores_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'stores'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: stores stores_short_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'stores_short_code_unique'
      AND n.nspname = 'public'
      AND c.relname = 'stores'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_short_code_unique" UNIQUE ("short_code");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_addresses user_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_addresses_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_addresses'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'withdrawals_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawals'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: idx_commissions_beneficiary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_commissions_beneficiary" ON "public"."commissions" USING "btree" ("beneficiary_id");


--
-- Name: idx_commissions_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_commissions_order" ON "public"."commissions" USING "btree" ("order_id");


--
-- Name: idx_points_logs_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_points_logs_order" ON "public"."points_logs" USING "btree" ("order_id");


--
-- Name: idx_points_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_points_logs_user" ON "public"."points_logs" USING "btree" ("user_id");


--
-- Name: idx_products_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_products_barcode" ON "public"."products" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);


--
-- Name: idx_refunds_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_refunds_order_id" ON "public"."refunds" USING "btree" ("order_id");


--
-- Name: idx_refunds_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_refunds_user_id" ON "public"."refunds" USING "btree" ("user_id");


--
-- Name: profiles on_profile_referral_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "on_profile_referral_code" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user_referral"();


--
-- Name: orders trg_generate_order_no; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_generate_order_no" BEFORE INSERT ON "public"."orders" FOR EACH ROW WHEN ((("new"."order_no" IS NULL) OR ("new"."order_no" = ''::"text"))) EXECUTE FUNCTION "public"."generate_order_no"();


--
-- Name: products trg_product_pending; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_product_pending" BEFORE INSERT ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_product_pending_on_insert"();


--
-- Name: products trg_product_review_active; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_product_review_active" BEFORE UPDATE OF "review_status" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."sync_product_active_on_review"();


--
-- Name: articles articles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'articles_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'articles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: cart_items cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'cart_items_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'cart_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: cart_items cart_items_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'cart_items_store_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'cart_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: cart_items cart_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'cart_items_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'cart_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commissions commissions_beneficiary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'commissions_beneficiary_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'commissions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commissions commissions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'commissions_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'commissions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commissions commissions_payer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'commissions_payer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'commissions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupons coupons_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'coupons_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: favorites favorites_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'favorites_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'favorites'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'favorites_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'favorites'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: footprints footprints_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'footprints_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'footprints'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."footprints"
    ADD CONSTRAINT "footprints_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: footprints footprints_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'footprints_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'footprints'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."footprints"
    ADD CONSTRAINT "footprints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: merchant_applications merchant_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'merchant_applications_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'merchant_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."merchant_applications"
    ADD CONSTRAINT "merchant_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_items_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_items_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items order_items_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_items_store_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_referrer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'orders_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: points_logs points_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'points_logs_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'points_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."points_logs"
    ADD CONSTRAINT "points_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: points_logs points_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'points_logs_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'points_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."points_logs"
    ADD CONSTRAINT "points_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_reviews product_reviews_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_reviews_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_reviews product_reviews_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_reviews_order_item_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_reviews_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_reviews product_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_reviews_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_category_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."store_categories"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_store_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_referrer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: refunds refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'refunds_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'refunds'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: refunds refunds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'refunds_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'refunds'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: store_categories store_categories_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'store_categories_store_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'store_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."store_categories"
    ADD CONSTRAINT "store_categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: stores stores_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'stores_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'stores'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_addresses user_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_addresses_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_addresses'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawals withdrawals_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'withdrawals_store_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawals'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawals withdrawals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'withdrawals_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawals'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: merchant_applications admin_all_applications; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_applications'
      AND n.nspname = 'public'
      AND c.relname = 'merchant_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_applications" ON "public"."merchant_applications" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: articles admin_all_articles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_articles'
      AND n.nspname = 'public'
      AND c.relname = 'articles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_articles" ON "public"."articles" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders admin_all_orders; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_orders'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_orders" ON "public"."orders" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products admin_all_products; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_products'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_products" ON "public"."products" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: stores admin_all_stores; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_stores'
      AND n.nspname = 'public'
      AND c.relname = 'stores'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_stores" ON "public"."stores" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawals admin_all_withdrawals; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_all_withdrawals'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawals'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_all_withdrawals" ON "public"."withdrawals" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles admin_full_profiles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_full_profiles'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_full_profiles" ON "public"."profiles" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: announcements admin_manage_announcements; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_manage_announcements'
      AND n.nspname = 'public'
      AND c.relname = 'announcements'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_manage_announcements" ON "public"."announcements" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles anon_no_profiles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon_no_profiles'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon_no_profiles" ON "public"."profiles" FOR SELECT TO "anon" USING (false);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."articles" ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions beneficiary_read_own_commissions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'beneficiary_read_own_commissions'
      AND n.nspname = 'public'
      AND c.relname = 'commissions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "beneficiary_read_own_commissions" ON "public"."commissions" FOR SELECT TO "authenticated" USING (("beneficiary_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."cart_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."commissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;

--
-- Name: footprints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."footprints" ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."merchant_applications" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: store_categories owner_manage_cats; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner_manage_cats'
      AND n.nspname = 'public'
      AND c.relname = 'store_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner_manage_cats" ON "public"."store_categories" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."stores"
  WHERE (("stores"."id" = "store_categories"."store_id") AND ("stores"."owner_id" = "auth"."uid"())))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products owner_manage_products; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner_manage_products'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner_manage_products" ON "public"."products" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."stores"
  WHERE (("stores"."id" = "products"."store_id") AND ("stores"."owner_id" = "auth"."uid"())))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: stores owner_manage_store; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner_manage_store'
      AND n.nspname = 'public'
      AND c.relname = 'stores'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner_manage_store" ON "public"."stores" TO "authenticated" USING (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: points_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."points_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."product_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements public_read_announcements; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_read_announcements'
      AND n.nspname = 'public'
      AND c.relname = 'announcements'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "public_read_announcements" ON "public"."announcements" FOR SELECT USING (("is_active" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: articles public_read_articles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_read_articles'
      AND n.nspname = 'public'
      AND c.relname = 'articles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "public_read_articles" ON "public"."articles" FOR SELECT USING (("is_published" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products public_read_products; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_read_products'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "public_read_products" ON "public"."products" FOR SELECT USING (("is_active" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: store_categories public_read_store_cats; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_read_store_cats'
      AND n.nspname = 'public'
      AND c.relname = 'store_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "public_read_store_cats" ON "public"."store_categories" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: stores public_read_stores; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_read_stores'
      AND n.nspname = 'public'
      AND c.relname = 'stores'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "public_read_stores" ON "public"."stores" FOR SELECT USING (("is_active" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds service_all_refunds; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_all_refunds'
      AND n.nspname = 'public'
      AND c.relname = 'refunds'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_all_refunds" ON "public"."refunds" TO "service_role" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commissions service_insert_commissions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_insert_commissions'
      AND n.nspname = 'public'
      AND c.relname = 'commissions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_insert_commissions" ON "public"."commissions" FOR INSERT TO "service_role" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: points_logs service_insert_points_logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_insert_points_logs'
      AND n.nspname = 'public'
      AND c.relname = 'points_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_insert_points_logs" ON "public"."points_logs" FOR INSERT TO "service_role" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: commissions service_update_commissions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'service_update_commissions'
      AND n.nspname = 'public'
      AND c.relname = 'commissions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "service_update_commissions" ON "public"."commissions" FOR UPDATE TO "service_role" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: store_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."store_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: stores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."stores" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_addresses" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items user_insert_order_items; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_insert_order_items'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_insert_order_items" ON "public"."order_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: refunds user_insert_own_refund; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_insert_own_refund'
      AND n.nspname = 'public'
      AND c.relname = 'refunds'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_insert_own_refund" ON "public"."refunds" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: articles user_manage_own_articles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_manage_own_articles'
      AND n.nspname = 'public'
      AND c.relname = 'articles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_manage_own_articles" ON "public"."articles" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: merchant_applications user_own_application; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_own_application'
      AND n.nspname = 'public'
      AND c.relname = 'merchant_applications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_own_application" ON "public"."merchant_applications" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: cart_items user_own_cart; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_own_cart'
      AND n.nspname = 'public'
      AND c.relname = 'cart_items'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_own_cart" ON "public"."cart_items" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: orders user_own_orders; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_own_orders'
      AND n.nspname = 'public'
      AND c.relname = 'orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_own_orders" ON "public"."orders" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: points_logs user_read_own_points_logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_read_own_points_logs'
      AND n.nspname = 'public'
      AND c.relname = 'points_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_read_own_points_logs" ON "public"."points_logs" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: refunds user_read_own_refunds; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_read_own_refunds'
      AND n.nspname = 'public'
      AND c.relname = 'refunds'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_read_own_refunds" ON "public"."refunds" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles user_update_own_profile; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_update_own_profile'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_update_own_profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK ((NOT ("role" IS DISTINCT FROM "public"."get_user_role"("auth"."uid"()))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items user_view_order_items; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_view_order_items'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_view_order_items" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles user_view_own_profile; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'user_view_own_profile'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "user_view_own_profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."withdrawals" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items 商家可读取自己门店订单条目; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '商家可读取自己门店订单条目'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "商家可读取自己门店订单条目" ON "public"."order_items" FOR SELECT USING (("store_id" IN ( SELECT "stores"."id"
   FROM "public"."stores"
  WHERE ("stores"."owner_id" = "auth"."uid"()))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawals 用户只能创建自己的提现申请; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户只能创建自己的提现申请'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawals'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户只能创建自己的提现申请" ON "public"."withdrawals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_reviews 用户只能发布自己的评价; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户只能发布自己的评价'
      AND n.nspname = 'public'
      AND c.relname = 'product_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户只能发布自己的评价" ON "public"."product_reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: withdrawals 用户只能查看自己的提现记录; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户只能查看自己的提现记录'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawals'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户只能查看自己的提现记录" ON "public"."withdrawals" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupons 用户查看自己的优惠券; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户查看自己的优惠券'
      AND n.nspname = 'public'
      AND c.relname = 'coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户查看自己的优惠券" ON "public"."coupons" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_addresses 用户管理自己的地址; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的地址'
      AND n.nspname = 'public'
      AND c.relname = 'user_addresses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的地址" ON "public"."user_addresses" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: favorites 用户管理自己的收藏; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的收藏'
      AND n.nspname = 'public'
      AND c.relname = 'favorites'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的收藏" ON "public"."favorites" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: footprints 用户管理自己的足迹; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户管理自己的足迹'
      AND n.nspname = 'public'
      AND c.relname = 'footprints'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户管理自己的足迹" ON "public"."footprints" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_reviews 评价可公开读; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '评价可公开读'
      AND n.nspname = 'public'
      AND c.relname = 'product_reviews'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "评价可公开读" ON "public"."product_reviews" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- PostgreSQL database dump complete
--




-- ============================================================
-- SECTION: DIFF FILTER OBJECTS
-- ============================================================
-- Objects that match diff-filter.json but cannot be represented
-- precisely by pg_dump --filter.

-- auth.users trigger: on_auth_user_created
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();';
  END IF;
END
$pg_schema_restore$;
-- policy: qrcodes_public_select on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'qrcodes_public_select'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY qrcodes_public_select ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''qrcodes''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: qrcodes_service_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'qrcodes_service_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY qrcodes_service_insert ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = ''qrcodes''::text));';
  END IF;
END
$pg_schema_restore$;

-- ============================================================
-- SECTION: STORAGE BUCKETS DATA
-- ============================================================

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('qrcodes', 'qrcodes', NULL, '2026-06-30 04:01:31.487569+00', '2026-06-30 04:01:31.487569+00', 'true', 'false', NULL, NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
