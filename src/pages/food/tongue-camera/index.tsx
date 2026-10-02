// 舌象拍摄引导页 · 非 AI
// ------------------------------------------------------------
// 参考业界舌诊拍摄引导（虚线舌形对齐框 + 前后置切换 + 拍照/相册/示例），
// 但严格遵循「去 AI 铁律」：所拍照片仅本地留档，用于「发给食养顾问真人研判」，
// 绝不经 AI 识图 / 识别 / 打分。
// 接入：食养 → 舌象自检 → 结果页「拍照留档」→ 本页拍摄 → 返回回填。
//
// 技术说明：相机为原生组件，覆盖层必须用 cover-view / cover-image，
// 故本页覆盖层样式一律走内联 style（cover-view 支持的样式子集）。

import { useState, useEffect, type CSSProperties } from 'react'
import { View, Text, Camera, CoverView, CoverImage, Image, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ICON_WHITE } from '@/components/Icon/iconBase64'
import './index.scss'

const PHOTO_KEY = 'tongue:photo'

export default function TongueCameraPage() {
  const [position, setPosition] = useState<'front' | 'back'>('back')
  const [photo, setPhoto] = useState('')
  const [sampleOpen, setSampleOpen] = useState(false)
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
        if (p) setPhoto(p)
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
          if (res?.tempImagePath) setPhoto(res.tempImagePath)
        },
        fail: () => Taro.showToast({ title: '拍照失败，请重试', icon: 'none' }),
      })
    } catch (e) {
      // 相机上下文不可用时，退回系统相机
      pickFrom('camera')
    }
  }

  const useThis = () => {
    if (!photo) return
    try {
      Taro.setStorageSync(PHOTO_KEY, photo)
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
      background: '#6F9E6F',
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

  return (
    <View className="tongue-cam-root">
      {photo ? (
        <View className="tongue-cam-preview">
          <Image src={photo} mode="aspectFit" className="tongue-cam-shot" />
          <View className="tongue-cam-preview-tip">
            <Text className="text-xs" style={{ color: 'rgba(255,255,255,0.85)' }}>
              请确认舌面完整、光线充足、无美颜滤镜
            </Text>
          </View>
          <View className="tongue-cam-preview-actions">
            <Button className="tongue-cam-btn ghost" onClick={() => setPhoto('')}>
              重拍
            </Button>
            <Button className="tongue-cam-btn solid" onClick={useThis}>
              使用这张
            </Button>
          </View>
        </View>
      ) : (
        <>
          <Camera
            className="tongue-cam-view"
            devicePosition={position}
            flash="off"
            onError={onCamError}
          />

          {/* 返回 */}
          <CoverView style={st.navBack} onClick={goBack}>
            <CoverImage src={ICON_WHITE['arrow-left']} style={st.icon44} />
          </CoverView>

          {/* 顶部提示胶囊（点击切换后置相机） */}
          <CoverView style={st.pill} onClick={togglePosition}>
            点此切换后置相机，由他人拍摄效果更佳
          </CoverView>

          {/* 中部虚线舌形对齐框 */}
          <CoverView style={st.outline}>
            <CoverView style={st.outlineLine} />
          </CoverView>
          <CoverView style={st.outlineTip}>将舌头伸入虚线框内，舌尖朝上、舌面完整</CoverView>

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
                  top: '30%',
                  background: '#FFFFFF',
                  borderRadius: '24rpx',
                  padding: '40rpx 36rpx',
                }}
                onClick={() => setSampleOpen(false)}
              >
                <CoverView style={{ fontSize: '32rpx', color: '#2A2A2A', lineHeight: '44rpx' }}>
                  拍摄示例要点
                </CoverView>
                <CoverView
                  style={{
                    fontSize: '26rpx',
                    color: '#6F675C',
                    lineHeight: '42rpx',
                    marginTop: '18rpx',
                  }}
                >
                  1. 光线充足、不逆光；2. 舌头自然伸出，舌尖朝上，舌面完整；3. 建议后置相机由他人拍摄；4. 请关闭美颜与滤镜，避免色差。
                </CoverView>
                <CoverView
                  style={{
                    fontSize: '26rpx',
                    color: '#6F9E6F',
                    lineHeight: '42rpx',
                    marginTop: '24rpx',
                    textAlign: 'center',
                  }}
                >
                  知道了，去拍摄
                </CoverView>
              </CoverView>
            </CoverView>
          ) : null}
        </>
      )}
    </View>
  )
}
