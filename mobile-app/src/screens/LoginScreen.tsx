import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useAuthStore } from '@/state/authStore'
import { theme, spacing } from '@/theme'

type Mode = 'password' | 'otp'

export const LoginScreen: React.FC = () => {
  const [mode, setMode] = useState<Mode>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const { signInWithUsername, signUpWithUsername, signInWithPhone, verifyPhoneOtp } = useAuthStore()

  const handlePassword = async () => {
    if (!username || !password) {
      Alert.alert('提示', '请输入账号和密码')
      return
    }
    setLoading(true)
    const { error } = await signInWithUsername(username, password)
    setLoading(false)
    if (error) Alert.alert('登录失败', error.message)
  }

  const handleOtp = async () => {
    if (!phone) {
      Alert.alert('提示', '请输入手机号')
      return
    }
    setLoading(true)
    const { error } = await signInWithPhone(phone)
    setLoading(false)
    if (error) {
      Alert.alert('发送失败', error.message)
    } else {
      Alert.alert('已发送', '测试账号请直接使用验证码 123456；生产环境将收到短信验证码。')
    }
  }

  const handleVerify = async () => {
    if (!phone || !code) {
      Alert.alert('提示', '请输入手机号和验证码')
      return
    }
    setLoading(true)
    const { error } = await verifyPhoneOtp(phone, code)
    setLoading(false)
    if (error) Alert.alert('验证失败', error.message)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>来电有喜</Text>
        <Text style={styles.subtitle}>食养好物 · 暖心陪伴</Text>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === 'password' && styles.tabActive]}
            onPress={() => setMode('password')}
          >
            <Text style={[styles.tabText, mode === 'password' && styles.tabTextActive]}>密码登录</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === 'otp' && styles.tabActive]}
            onPress={() => setMode('otp')}
          >
            <Text style={[styles.tabText, mode === 'otp' && styles.tabTextActive]}>手机验证码</Text>
          </Pressable>
        </View>

        {mode === 'password' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="用户名 / 手机号 / 邮箱"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
            <TextInput
              style={styles.input}
              placeholder="密码"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Pressable style={styles.button} onPress={handlePassword} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>登录</Text>}
            </Pressable>
            <Pressable
              style={styles.link}
              onPress={async () => {
                if (!username || !password) {
                  Alert.alert('提示', '请先填写要注册的账号和密码')
                  return
                }
                setLoading(true)
                const { error } = await signUpWithUsername(username, password)
                setLoading(false)
                if (error) Alert.alert('注册失败', error.message)
                else Alert.alert('注册成功', '请登录')
              }}
            >
              <Text style={styles.linkText}>没有账号？点此注册</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="手机号，如 +8618701410500"
              keyboardType="phone-pad"
              autoCapitalize="none"
              value={phone}
              onChangeText={setPhone}
            />
            <Pressable style={styles.button} onPress={handleOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>获取验证码</Text>}
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="验证码（测试账号 123456）"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
            />
            <Pressable style={styles.button} onPress={handleVerify} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>登录 / 注册</Text>}
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  inner: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  logo: { fontSize: 34, fontWeight: '800', color: theme.primary, textAlign: 'center' },
  subtitle: { fontSize: 14, color: theme.subText, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xl },
  tabs: { flexDirection: 'row', backgroundColor: theme.border, borderRadius: 10, padding: 3, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: theme.card },
  tabText: { fontSize: 14, color: theme.subText },
  tabTextActive: { color: theme.primary, fontWeight: '700' },
  input: {
    backgroundColor: theme.card,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: theme.primary, fontSize: 14 },
})
