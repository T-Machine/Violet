import * as Captchapng from 'captchapng2'
import * as fs from 'fs'

import config from '../app/config/config'
import * as userModel from '../app/model/user'
import { Context } from '../types/context'
import * as assert from './assert'
import * as mailer from './email'
import moment = require('moment')

/**
 * 检查图形验证码, 并且清除Session中的验证码记录
 *
 * 当记录不存在或记录超过5分钟时, 抛出`timeout_captcha`错误;
 * 当记录错误时, 抛出`error_captcha`错误.
 * @param {Context} ctx Koa上下文
 * @param {string} vcode 图形验证码
 * @returns {boolean} 验证码是否正确
 */
export function checkCaptcha(ctx: Context, vcode: string): void {
  assert(Date.now() - ctx.session!.verify.captchaTime! < 300 * 1000, 'timeout_captcha')
  if (ctx.session!.verify.captcha === vcode) {
    ctx.session!.verify.captchaTime = undefined
  } else {
    ctx.session!.verify.captchaTime = undefined
    assert(false, 'error_captcha')
  }
}

/**
 * 检查邮箱验证码, 并且清除Session中的验证码记录
 *
 * 当记录不存在或记录超过10分钟时, 抛出`timeout_code`错误;
 * 当记录与操作不符时, 抛出`error_operator`错误;
 * 当记录错误时, 抛出`error_code`错误.
 * @param {Context} ctx Koa上下文
 * @param {string} code 邮箱验证码
 * @param {string} operator 操作
 */
export function checkEmailCode(ctx: Context, code: string, operator: string) {
  assert(Date.now() - ctx.session!.verify.emailTime! < 600 * 1000, 'timeout_code')
  if (ctx.session!.verify.emailType !== operator) {
    ctx.session!.verify.emailTime = undefined
    assert(false, 'error_operator')
  } else if (ctx.session!.verify.emailCode === code) {
    ctx.session!.verify.emailTime = undefined
  } else {
    // ctx.session!.verify.emailTime = undefined
    assert(false, 'error_code')
  }
}

/**
 * 检查手机验证码, 并且清除Session中的验证码记录
 *
 * 当记录不存在或记录超过10分钟时, 抛出`timeout_code`错误;
 * 当记录与操作不符时, 抛出`error_operator`错误;
 * 当记录错误时, 抛出`error_code`错误.
 * @param {Context} ctx Koa上下文
 * @param {string} code 手机验证码
 */
export function checkPhoneCode(ctx: Context, code: string, operator: string) {
  assert(Date.now() - ctx.session!.verify.phoneTime! < 300 * 1000, 'timeout_code')
  if (ctx.session!.verify.phoneType !== operator) {
    ctx.session!.verify.phoneTime = undefined
    assert(false, 'error_operator')
  } else if (ctx.session!.verify.phoneCode === code) {
    ctx.session!.verify.phoneTime = undefined
  } else {
    ctx.session!.verify.phoneTime = undefined
    assert(false, 'error_code')
  }
}

/**
 * 生成验证码图片, 并将验证码记录存储到Session中
 *
 * @param {Context} ctx - Koa上下文
 * @returns {string} 验证码图片的Base64字符串
 */
export function getCaptcha(ctx: Context): string {
  const rand = Math.trunc(Math.random() * 9000 + 1000)
  const png = new Captchapng(80, 30, rand)
  ctx.session!.verify.captcha = rand.toString()
  ctx.session!.verify.captchaTime = Date.now()
  return 'data:image/png;base64,'.concat(png.getBase64())
}

/**
 * 生成邮箱验证码，并将验证码记录存储到Session中
 * @param {Context} ctx Koa上下文
 * @param {string} email 邮箱地址
 * @param {string} type 操作类型
 * @returns {string} 验证码
 */
export function getEmailCode(ctx: Context, email: string, type: string): string {
  assert(!ctx.session!.verify.emailTime || Date.now() - ctx.session!.verify.emailTime! > 60 * 1000, 'limit_time')
  const rand = Math.trunc(Math.random() * 900000 + 100000)
  ctx.session!.verify.email = email
  ctx.session!.verify.emailType = type
  ctx.session!.verify.emailCode = rand.toString()
  ctx.session!.verify.emailTime = Date.now()
  return rand.toString()
}

export function getPhoneCode(ctx: Context, phone: string, type: string): string {
  assert(!ctx.session!.verify.phoneTime || Date.now() - ctx.session!.verify.phoneTime! > 60 * 1000, 'limit_time')
  // TODO: 验证码暂时固定为123456
  // const rand = Math.trunc(Math.random() * 900000 + 100000)
  const rand = '123456'
  ctx.session!.verify.phone = phone
  ctx.session!.verify.phoneType = type
  ctx.session!.verify.phoneCode = rand.toString()
  ctx.session!.verify.phoneTime = Date.now()
  return rand.toString()
}

/**
 * 登陆状态检验
 * 当不存在登陆记录时，抛出`invalid_token`错误
 * 当登陆记录过期时，抛出`timeout_token`错误
 * @param {Context} ctx Koa上下文
 */
export async function requireLogin(ctx: Context) {
  assert(ctx.session!.user.id, 'invalid_token', 401)
  assert(ctx.session!.user.remember || Date.now() - ctx.session!.user.time! <= 86400 * 1000, 'timeout_token', 401)
  if (!ctx.session!.user.remember) ctx.session!.user.time = Date.now()
}

/**
 * 用户等级检验
 * 当权限不足时，抛出`permission_deny`错误
 * @param {Context} ctx Koa上下文
 * @param {number} [minLevel] 用户最小所需的等级，默认为0
 */
export async function requireMinUserLevel(ctx: Context, minLevel: number = 0): Promise<void> {
  assert((await userModel.getLevelById(ctx.session!.user.id!)) >= minLevel, 'permission_deny', 403)
}

export async function requireUserLevel(ctx: Context, level: number = 0): Promise<void> {
  assert((await userModel.getLevelById(ctx.session!.user.id!)) === level, 'permission_deny', 403)
}

/**
 * 发送验证码邮件
 * @param {Context} ctx Koa上下文
 * @param {string} type 操作类型
 * @param {string} email 邮箱地址
 * @param {string | undefined} name 名字
 */
export async function sendEmailCode(ctx: Context, type: string, email: string, name?: string) {
  assert(!ctx.session!.verify.emailTime || Date.now() - ctx.session!.verify.emailTime! > 60 * 1000, 'limit_time')
  const rand = Math.trunc(Math.random() * 900000 + 100000)
  ctx.session!.verify.email = email
  ctx.session!.verify.emailType = type
  ctx.session!.verify.emailCode = rand.toString()
  ctx.session!.verify.emailTime = Date.now()
  switch (type) {
    case 'register':
      assert(
        await mailer.sendEmail(config!.email.from.code, email, 'Violet邮箱验证码', fs.readFileSync('layout/register.html', 'utf8'), {
          code: rand,
          time: moment().format('YYYY/M/DD HH:mm:ss')
        }),
        'send_fail'
      )
      break
    case 'reset':
      break
    case 'update':
      break
  }
}

// const sender = Sms(config.sms.qcloud.appId, config.sms.qcloud.appKey).SmsSingleSender()

/**
 * 发送验证码短信
 *
 * @param {Context} ctx Koa上下文
 * @param {string} type 操作类型
 * @param {string} phone 手机
 * @param {string | undefined} name 名字
 * @returns {boolean} 是否发送成功
 */
export async function sendPhoneCode(ctx: Context, type: string, phone: string, name?: string): Promise<void> {
  assert(!ctx.session!.verify.phoneTime || Date.now() - ctx.session!.verify.phoneTime! > 60 * 1000, 'limit_time')
  // const rand = Math.trunc(Math.random() * 900000 + 100000)
  const rand = 123456
  ctx.session!.verify.phone = phone
  ctx.session!.verify.phoneType = type
  ctx.session!.verify.phoneCode = rand.toString()
  ctx.session!.verify.phoneTime = Date.now()
  assert(true, 'send_fail')
}