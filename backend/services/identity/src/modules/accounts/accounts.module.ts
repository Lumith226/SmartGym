import { Controller, Get, Post, Patch, Req, Res, Body, Param, Module, Inject, HttpCode } from '@nestjs/common';
import { TLSSocket } from 'node:tls';
import { isIP } from 'node:net';
import { Identity, denied } from './identity.js';
import { validate } from './validation.js';

interface Request { method: string; path: string; headers: Record<string, string | string[] | undefined>; socket: TLSSocket }
interface Response { setHeader(name: string, value: string): void }
const cookieName = '__Host-sg_session';
function cookie(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (typeof header !== 'string') return;
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(cookieName + '='));
  if (values.length > 1) denied('UNAUTHENTICATED', 401);
  return values[0]?.slice(cookieName.length + 1);
}
const sessionCookie = (value: string, age: number) => `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export function createAccountsModule(identity: Identity) {
  @Controller()
  class IdentityController {
    constructor(@Inject('IDENTITY') private readonly identity: Identity) {}
    private async limitIp(request: Request, category: string) {
      const ip = request.headers['x-smartgym-client-ip'];
      if (typeof ip !== 'string' || !isIP(ip)) denied('BAD_REQUEST', 400);
      const normalized = isIP(ip) === 6 ? new URL('http://[' + ip + ']').hostname : ip;
      await this.identity.limit('ip:' + category, normalized, 100);
    }
    private async input(request: Request, schema: string, body: unknown, category: string) {
      await this.limitIp(request, category);
      const value = validate(schema, body);
      if (value.email) await this.identity.limit('email:' + category, value.email.toLowerCase(), category === 'login' ? 10 : 3);
      return value;
    }
    @Post('api/v1/auth/register') @HttpCode(202)
    async register(@Req() req: Request, @Body() body: unknown) { await this.identity.register(await this.input(req, 'RegisterRequest', body, 'register')); }
    @Post('api/v1/auth/verification-requests') @HttpCode(202)
    async resend(@Req() req: Request, @Body() body: unknown) { const value = await this.input(req, 'EmailRequest', body, 'verify-request'); await this.identity.requestEmail(value.email, 'VERIFY_EMAIL'); }
    @Post('api/v1/auth/password-reset-requests') @HttpCode(202)
    async resetRequest(@Req() req: Request, @Body() body: unknown) { const value = await this.input(req, 'EmailRequest', body, 'reset-request'); await this.identity.requestEmail(value.email, 'RESET_PASSWORD'); }
    @Post('api/v1/auth/verify-email') @HttpCode(204)
    async verify(@Req() req: Request, @Body() body: unknown) { const value = await this.input(req, 'TokenRequest', body, 'verify'); await this.identity.consume(value.token, 'VERIFY_EMAIL'); }
    @Post('api/v1/auth/password-reset') @HttpCode(204)
    async reset(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const value = await this.input(req, 'ResetPasswordRequest', body, 'reset'); await this.identity.consume(value.token, 'RESET_PASSWORD', value.newPassword);
      res.setHeader('Set-Cookie', sessionCookie('', 0));
    }
    @Post('api/v1/auth/login') @HttpCode(200)
    async login(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const value = await this.input(req, 'LoginRequest', body, 'login'), result = await this.identity.login(value, cookie(req));
      res.setHeader('Set-Cookie', sessionCookie(result.handle, 604800)); return result.profile;
    }
    @Post('internal/v1/identity/google-login') @HttpCode(200)
    async googleLogin(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const value = await this.input(req, 'GoogleLoginIdentity', body, 'google-login');
      const result = await this.identity.loginWithGoogle(value, cookie(req));
      res.setHeader('Set-Cookie', sessionCookie(result.handle, 604800));
      return result.profile;
    }
    @Post('api/v1/auth/logout') @HttpCode(204)
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
      await this.limitIp(req, 'logout');
      await this.identity.logout(cookie(req)); res.setHeader('Set-Cookie', sessionCookie('', 0));
    }
    @Get('api/v1/me') me(@Req() req: Request) { return this.identity.getMe(cookie(req)); }
    @Patch('api/v1/me')
    async update(@Req() req: Request, @Body() body: unknown) { return this.identity.updateMe(cookie(req), await this.input(req, 'ProfileUpdate', body, 'profile')); }
    @Post('internal/v1/identity/sessions/introspect') @HttpCode(200)
    introspect(@Body() body: unknown) { return this.identity.introspect(validate('IdentityIntrospection', body).sessionHandle); }
    @Get('internal/v1/identity/jwks') jwks() { return this.identity.options.keys.jwks; }
    @Get('internal/v1/identity/email-deliveries/:deliveryRef')
    delivery(@Param('deliveryRef') id: string) { this.uuid(id); return this.identity.resolveDelivery(id); }
    @Get('internal/v1/identity/users/:userId/notification-contact')
    contact(@Param('userId') id: string) { this.uuid(id); return this.identity.contact(id); }
    private uuid(value: string) { if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) denied('BAD_REQUEST', 400); }
  }

  @Module({ controllers: [IdentityController], providers: [{ provide: 'IDENTITY', useValue: identity }] })
  class AccountsModule {}

  return AccountsModule;
}
