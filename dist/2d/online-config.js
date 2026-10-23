/* 归墟 · 在线服务配置（Supabase）。
 * URL 和 anon key 是设计上就放在网页里的公开信息（数据靠数据库的行级安全策略保护）。
 * 两项为空时在线登录关闭，只能用「本机游客」模式。建表脚本见 docs/supabase-setup.sql。 */
export const SUPABASE_URL='https://gmtzeandsdbtcgiaptqz.supabase.co';
export const SUPABASE_ANON_KEY='';
/** 测试账号的账号名（建表脚本里注册时自动标记为测试员；GM 面板只对测试员显示）。 */
export const TEST_ACCOUNT='guixu_test';
