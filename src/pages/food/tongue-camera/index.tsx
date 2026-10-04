// 舌象拍摄引导页（正面 + 反面 两步）
// ------------------------------------------------------------
// 参考业界舌诊拍摄引导（虚线舌形对齐框【仅舌面 / 舌头步骤】 + 前后置切换 + 拍照/相册/示例）。
// 分两步拍摄：① 舌面（正面）→ ② 舌下（反面 / 舌底），两张**本地留档**，
// 返回后由用户逐项对照舌象特征（纯本地、零云、不依赖任何视觉识别服务）。
// 舌象分析全程走本地规则引擎（v2 进阶算法），界面不出现「AI」字样。
// 接入：食养 → 舌象自检 → 「拍照 + 对照自检」→ 本页两步拍摄 → 返回对照问卷。
// 技术说明：相机为原生组件，覆盖层必须用 cover-view / cover-image，
// 故本页覆盖层样式一律走内联 style（cover-view 支持的样式子集）。

import { useState, useEffect, type CSSProperties } from 'react'
import { View, Text, Camera, CoverView, CoverImage, Image, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ICON_WHITE } from '@/components/Icon/iconBase64'
import './index.scss'

export default function TongueCameraPage() {
  // 拍摄步骤：先拍舌面（正面），再拍舌下（反面）
  const [step, setStep] = useState<'front' | 'back'>('front')
  const [frontPhoto, setFrontPhoto] = useState('')
  const [backPhoto, setBackPhoto] = useState('')
  // 当前步骤刚拍下的预览图（确认后提交到对应侧）
  const [shot, setShot] = useState('')
  const [sampleOpen, setSampleOpen] = useState(false)
  const [position, setPosition] = useState<'front' | 'back'>('back')
  const [statusBar, setStatusBar] = useState(40)

  useEffect(() => {
    try {
      const info: any = Taro.getWindowInfo ? Taro.getWindowInfo() : Taro.getSystemInfoSync()
      setStatusBar(info?.statusBarHeight || 40)
    } catch (e) {
      /* ignore */
    }
  }, [])

  const togglePosition = () => setPosition((p) => (p === 'back' ? 'front' : 'back'))

  const pickFrom = (source: 'camera' | 'album') => {
    Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: [source] })
      .then((res: any) => {
        const p = res?.tempFilePaths?.[0]
        if (p) setShot(p)
      })
      .catch(() => {
        /* 用户取消，忽略 */
      })
  }

  const takePhoto = () => {
    try {
      const ctx = (Taro as any).createCameraContext()
      if (!ctx || !ctx.takePhoto) {
        pickFrom('camera')
        return
      }
      ctx.takePhoto({
        quality: 'high',
        success: (res: any) => {
          if (res?.tempImagePath) setShot(res.tempImagePath)
        },
        fail: () => Taro.showToast({ title: '拍照失败，请重试', icon: 'none' }),
      })
    } catch (e) {
      // 相机上下文不可用时，退回系统相机
      pickFrom('camera')
    }
  }

  // 确认当前预览：舌面 → 进入下一步（舌下）；舌下 → 标记完成
  const confirmShot = () => {
    if (!shot) return
    if (step === 'front') {
      setFrontPhoto(shot)
      setShot('')
      setStep('back')
    } else {
      setBackPhoto(shot)
      setShot('')
    }
  }

  // 两步都拍完 → 本地留档（供结果页预览 / 发给食养顾问真人），不调任何云端识别
  const useThis = () => {
    if (!frontPhoto || !backPhoto) return
    try {
      Taro.setStorageSync(
        'tongue:captured',
        JSON.stringify({ front: frontPhoto, back: backPhoto }),
      )
    } catch (e) {
      /* ignore */
    }
    Taro.navigateBack()
  }

  const onCamError = () => {
    Taro.showModal({
      title: '相机不可用',
      content: '请开启相机权限，或改用相册上传舌部照片。',
      confirmText: '去设置',
      success: (r) => {
        if (r.confirm) Taro.openSetting({})
      },
    })
  }

  const goBack = () => Taro.navigateBack()

  // 重新拍摄：清空两侧，回到第一步
  const retakeAll = () => {
    setFrontPhoto('')
    setBackPhoto('')
    setShot('')
    setStep('front')
  }

  // 仅重拍舌下（保留已拍好的舌面，回到第二步）
  const retakeBack = () => {
    setBackPhoto('')
    setShot('')
    setStep('back')
  }

  // 当前步骤的引导文案
  const isFront = step === 'front'
  const pillText = isFront
    ? '第 1 步 · 将舌头伸出，舌尖朝上，拍舌面（正面）'
    : '第 2 步 · 微微卷舌，拍舌下（反面），看舌底青筋'
  const outlineTip = isFront
    ? '舌面伸入虚线框，光线充足、无美颜滤镜'
    : '微微卷舌，让舌底两侧青筋清晰居中'

  // —— cover-view 统一内联样式（原生覆盖层只支持样式子集）——
  const st = {
    navBack: {
      position: 'absolute',
      top: `${statusBar + 8}px`,
      left: '24rpx',
      width: '64rpx',
      height: '64rpx',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as CSSProperties,
    pill: {
      position: 'absolute',
      top: `${statusBar + 24}px`,
      left: '140rpx',
      right: '140rpx',
      background: 'rgba(217,169,120,0.96)',
      borderRadius: '999rpx',
      padding: '14rpx 24rpx',
      color: '#FFFFFF',
      fontSize: '24rpx',
      lineHeight: '34rpx',
      textAlign: 'center',
    } as CSSProperties,
    outline: {
      position: 'absolute',
      top: '330rpx',
      left: '50%',
      marginLeft: '-250rpx',
      width: '500rpx',
      height: '640rpx',
      border: '4rpx dashed rgba(255,255,255,0.9)',
      borderRadius: '46% 46% 44% 44% / 52% 52% 48% 48%',
    } as CSSProperties,
    outlineLine: {
      position: 'absolute',
      top: '150rpx',
      left: '60rpx',
      right: '60rpx',
      height: '2rpx',
      background: 'rgba(255,255,255,0.45)',
    } as CSSProperties,
    outlineTip: {
      position: 'absolute',
      top: '1000rpx',
      left: '80rpx',
      right: '80rpx',
      textAlign: 'center',
      color: 'rgba(255,255,255,0.85)',
      fontSize: '24rpx',
      lineHeight: '34rpx',
    } as CSSProperties,
    barWrap: {
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '80rpx',
      height: '180rpx',
    } as CSSProperties,
    sideItem: {
      position: 'absolute',
      bottom: '20rpx',
      width: '140rpx',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    } as CSSProperties,
    sideLabel: {
      color: '#FFFFFF',
      fontSize: '22rpx',
      lineHeight: '30rpx',
      marginTop: '10rpx',
      textAlign: 'center',
    } as CSSProperties,
    shutter: {
      position: 'absolute',
      left: '50%',
      bottom: '0',
      marginLeft: '-85rpx',
      width: '170rpx',
      height: '170rpx',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.25)',
      border: '6rpx solid rgba(255,255,255,0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as CSSProperties,
    shutterInner: {
      width: '124rpx',
      height: '124rpx',
      borderRadius: '50%',
      background: '#16A34A',
    } as CSSProperties,
    sample: {
      position: 'absolute',
      right: '40rpx',
      bottom: '290rpx',
      width: '140rpx',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    } as CSSProperties,
    icon28: { width: '52rpx', height: '52rpx' } as CSSProperties,
    icon44: { width: '44rpx', height: '44rpx' } as CSSProperties,
  }

  // —— 完成态：两张都拍完，展示缩略图 + 分析 ——
  if (backPhoto && !shot) {
    return (
      <View className="tongue-cam-root">
        <View className="tongue-cam-done">
          <Text className="text-lg font-bold text-[#2A2A2A]">两张都拍好了</Text>
            <Text className="text-xs text-[#6F675C] mt-1 block">
              照片已本地留档（不联网、不上传），返回后请对照两张照片，逐项勾选 8 项舌象特征，本地算法即时给出你的食养倾向
            </Text>
            <View className="mt-5 flex items-center justify-center gap-5">
              <View className="flex flex-col items-center">
                <Image src={frontPhoto} mode="aspectFill" className="h-32 w-32 rounded-2xl" />
                <Text className="text-xs text-[#6F675C] mt-2">舌面（正面）</Text>
              </View>
              <View className="flex flex-col items-center">
                <Image src={backPhoto} mode="aspectFill" className="h-32 w-32 rounded-2xl" />
                <Text className="text-xs text-[#6F675C] mt-2">舌下（反面）</Text>
              </View>
            </View>

            <View className="mt-6 flex flex-col gap-3">
              <Button
                onClick={useThis}
                className="rounded-full"
                style={{ background: 'hsl(var(--primary))', color: '#fff' }}
              >
                保存并返回对照自检
              </Button>
              <View className="flex flex-row gap-3">
                <Button
                  onClick={retakeBack}
                  className="rounded-full"
                  style={{ flex: 1, background: '#fff', color: 'hsl(var(--primary))', borderWidth: 1, borderColor: '#ECE6DD' }}
                >
                  重拍舌下
                </Button>
                <Button
                  onClick={retakeAll}
                  className="rounded-full"
                  style={{ flex: 1, background: '#fff', color: 'hsl(var(--primary))', borderWidth: 1, borderColor: '#ECE6DD' }}
                >
                  重拍全部
                </Button>
              </View>
            </View>
        </View>
      </View>
    )
  }

  // —— 预览态：刚拍下某一侧，确认或重拍 ——
  if (shot) {
    return (
      <View className="tongue-cam-root">
        <View className="tongue-cam-preview">
          <Image src={shot} mode="aspectFit" className="tongue-cam-shot" />
          <View className="tongue-cam-preview-tip">
            <Text className="text-xs" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {isFront ? '这是舌面（正面），确认后继续拍舌下' : '这是舌下（反面），确认后返回对照自检'}
            </Text>
          </View>
          <View className="tongue-cam-preview-actions">
            {!isFront ? (
              <Button
                className="tongue-cam-btn ghost"
                onClick={() => {
                  setShot('')
                  setStep('front')
                }}
              >
                上一步
              </Button>
            ) : null}
            <Button className="tongue-cam-btn ghost" onClick={() => setShot('')}>
              重拍
            </Button>
            <Button className="tongue-cam-btn solid" onClick={confirmShot}>
              {isFront ? '下一步：拍舌下' : '确认'}
            </Button>
          </View>
        </View>
      </View>
    )
  }

  // —— 拍摄态：原生相机 + 覆盖层 ——
  return (
    <View className="tongue-cam-root">
      <Camera className="tongue-cam-view" devicePosition={position} flash="off" onError={onCamError} />

      {/* 返回 */}
      <CoverView style={st.navBack} onClick={goBack}>
        <CoverImage src={ICON_WHITE['arrow-left']} style={st.icon44} />
      </CoverView>

      {/* 顶部提示胶囊（点击切换后置相机） */}
      <CoverView style={st.pill} onClick={togglePosition}>
        {pillText}
      </CoverView>

      {/* 中部虚线舌形对齐框：仅「舌头 / 舌面」步骤需要；舌下步骤无需对齐框 */}
      {isFront ? (
        <CoverView style={st.outline}>
          <CoverView style={st.outlineLine} />
        </CoverView>
      ) : null}
      <CoverView style={st.outlineTip}>{outlineTip}</CoverView>

      {/* 底部操作栏 */}
      <CoverView style={st.barWrap}>
        <CoverView style={{ ...st.sideItem, left: '70rpx' }} onClick={togglePosition}>
          <CoverImage src={ICON_WHITE['shuffle']} style={st.icon28} />
          <CoverView style={st.sideLabel}>切换</CoverView>
        </CoverView>

        <CoverView style={st.shutter} onClick={takePhoto}>
          <CoverView style={st.shutterInner} />
        </CoverView>

        <CoverView style={{ ...st.sideItem, right: '70rpx' }} onClick={() => pickFrom('album')}>
          <CoverImage src={ICON_WHITE['image']} style={st.icon28} />
          <CoverView style={st.sideLabel}>相册</CoverView>
        </CoverView>
      </CoverView>

      {/* 示例 */}
      <CoverView style={st.sample} onClick={() => setSampleOpen(true)}>
        <CoverImage src={ICON_WHITE['information-outline']} style={st.icon28} />
        <CoverView style={st.sideLabel}>示例</CoverView>
      </CoverView>

      {/* 示例弹窗（cover-view 实现，避免被原生相机遮挡） */}
      {sampleOpen ? (
        <CoverView
          style={{
            position: 'absolute',
            left: '0',
            right: '0',
            top: '0',
            bottom: '0',
            background: 'rgba(0,0,0,0.72)',
          }}
          onClick={() => setSampleOpen(false)}
        >
          <CoverView
            style={{
              position: 'absolute',
              left: '60rpx',
              right: '60rpx',
              top: '22%',
              background: '#FFFFFF',
              borderRadius: '24rpx',
              padding: '40rpx 36rpx 32rpx',
            }}
            onClick={() => setSampleOpen(false)}
          >
            <CoverView style={{ fontSize: '32rpx', color: '#2A2A2A', lineHeight: '44rpx', textAlign: 'center' }}>
              拍摄示例
            </CoverView>

            <CoverView style={{ fontSize: '22rpx', color: '#9A9388', lineHeight: '32rpx', marginTop: '12rpx', textAlign: 'center' }}>
              共两步：先拍舌面，再拍舌下
            </CoverView>

            {/* 示意对齐框：与实时取景同款虚线框，提示舌头如何摆放 */}
            <CoverView style={{ marginTop: '22rpx', display: 'flex', justifyContent: 'center' }}>
              <CoverView
                style={{
                  width: '160rpx',
                  height: '200rpx',
                  border: '4rpx dashed #D9A978',
                  borderRadius: '90rpx',
                }}
              />
            </CoverView>
            <CoverView style={{ fontSize: '22rpx', color: '#9A9388', lineHeight: '32rpx', marginTop: '12rpx', textAlign: 'center' }}>
              示意 · 舌尖朝上，舌面伸入框内
            </CoverView>

            {/* 分条要点 */}
            <CoverView style={{ fontSize: '25rpx', color: '#6F675C', lineHeight: '40rpx', marginTop: '22rpx' }}>
              · 第 1 步：自然光下伸出舌头，拍舌面（正面）
            </CoverView>
            <CoverView style={{ fontSize: '25rpx', color: '#6F675C', lineHeight: '40rpx', marginTop: '6rpx' }}>
              · 第 2 步：微微卷舌，拍舌下（反面）看舌底青筋
            </CoverView>
            <CoverView style={{ fontSize: '25rpx', color: '#6F675C', lineHeight: '40rpx', marginTop: '6rpx' }}>
              · 后置相机由他人拍摄效果更佳
            </CoverView>
            <CoverView style={{ fontSize: '25rpx', color: '#6F675C', lineHeight: '40rpx', marginTop: '6rpx' }}>
              · 关闭美颜与滤镜，避免色差
            </CoverView>

            <CoverView style={{ fontSize: '28rpx', color: '#16A34A', lineHeight: '44rpx', marginTop: '26rpx', textAlign: 'center' }}>
              知道了，去拍摄
            </CoverView>
          </CoverView>
        </CoverView>
      ) : null}
    </View>
  )
}
