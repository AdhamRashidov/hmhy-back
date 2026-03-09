import {
	Controller,
	Get,
	Post,
	Body,
	Req,
	Res,
	UseGuards,
	Patch,
	Param,
	Delete,
	ParseUUIDPipe,
} from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { JwtService } from '@nestjs/jwt';
import type { Response, Request } from 'express';
import { config } from 'src/config';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { SoftDeleteDto } from './dto/soft-delete.dto';
import { AccessRoles } from 'src/common/decorator/roles.decorator';
import { Roles } from 'src/common/enum/index.enum';
import { RolesGuard } from 'src/common/guard/role.guard';
import { AuthGuard } from 'src/common/guard/auth.guard';
import { AuthGuard as AuthPassportGuard } from '@nestjs/passport';
import { CurrentUser } from 'src/common/decorator/current-user.decorator';
import type { IToken } from 'src/infrastructure/token/interface';
import passport from 'passport';

@ApiTags('Teacher - Google OAuth')
@Controller('teacher')
export class TeacherController {
	constructor(
		private teacherService: TeacherService,
		private jwtService: JwtService,
	) { }

	// Google OAuth endpoints
	@Get('google')
	@ApiOperation({ summary: 'Google OAuth login' })
	googleLogin(@Req() req, @Res() res) {
		passport.authenticate(
			'google',
			{
				scope: [
					'email',
					'profile',
					'https://www.googleapis.com/auth/calendar',
					'https://www.googleapis.com/auth/calendar.events',
				],
				accessType: 'offline',
				prompt: 'consent',
			} as passport.AuthenticateOptions,
			(err, user, info) => {
				if (err) {
					return res
						.status(500)
						.json({ error: 'Authentication failed', details: err });
				}
				if (!user) {
					return res.status(401).json({ error: 'No user found', info });
				}


				req.logIn(user, (loginErr) => {
					if (loginErr) {
						return res
							.status(500)
							.json({ error: 'Login failed', details: loginErr });
					}
					return res.redirect('/dashboard');
				});
			},
		)(req, res);
	}

	@Get('google/callback')
	@UseGuards(AuthPassportGuard('google'))
	async googleCallback(@Req() req: Request, @Res() res: Response) {
		const googleUser = req.user as any;

		try {
			// 1. Ustozni yaratish yoki yangilash
			const teacher = await this.teacherService.createIncompleteGoogleTeacher({
				email: googleUser.email,
				fullName: googleUser.fullName,
				googleId: googleUser.googleId,
				imageUrl: googleUser.imageUrl,
				accessToken: googleUser.accessToken,
				refreshToken: googleUser.refreshToken,
			});

			// 2. JWT Token yaratish (Role bilan birga)
			const token = this.jwtService.sign({
				id: teacher.id,
				email: teacher.email,
				role: Roles.TEACHER
			},
				{
					secret: config.TOKEN.ACCESS_TOKEN_KEY
				});

			// 3. Frontend uchun URL tayyorlash
			const frontendCallbackUrl = `http://localhost:5173/auth/callback?accessToken=${token}&role=TEACHER`;

			// 4. Har qanday holatda ham frontendga qaytarish 🚀
			return res.redirect(frontendCallbackUrl);

		} catch (error: any) {
			// Xatolik bo'lsa login sahifasiga xabar bilan qaytarish
			return res.redirect(`http://localhost:5173/teacher-login?error=${encodeURIComponent(error.message)}`);
		}
	}

	@Post('google/send-otp')
	async sendOtp(@Body() body: SendOtpDto) {
		return await this.teacherService.initiateGoogleRegistration(body);
	}

	@Post('google/verify-otp')
	async verifyOtp(@Body() body: VerifyOtpDto) {
		return await this.teacherService.verifyAndActivate(body);
	}

	@Get('me')
	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.TEACHER)
	getMe(@CurrentUser() user: IToken) {
		return this.teacherService.findOneById(user.id, {
			select: {
				id: true,
				cardNumber: true,
				description: true,
				email: true,
				fullName: true,
				phoneNumber: true,
				experience: true,
				hourPrice: true,
				imageUrl: true,
				level: true,
				portfolioLink: true,
				rating: true,
				specification: true,
				role: true,
			},
		});
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
	@Patch('soft-delete/:id')
	softDelete(
		@Param('id') id: string,
		@Body() dto: SoftDeleteDto,
		@CurrentUser() admin: IToken,
	) {
		return this.teacherService.softDelete(id, dto, admin.id);
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
	@Get()
	findAll() {
		return this.teacherService.findAll({
			//   where: { isActive: true },
			select: {
				id: true,
				cardNumber: true,
				description: true,
				email: true,
				fullName: true,
				phoneNumber: true,
				experience: true,
				hourPrice: true,
				imageUrl: true,
				level: true,
				portfolioLink: true,
				rating: true,
				specification: true,
				isActive: true,
				role: true,
			},
		});
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
	@Get('applications')
	findAllApplications() {
		return this.teacherService.findAll({
			where: { isActive: false },
			select: {
				id: true,
				cardNumber: true,
				description: true,
				email: true,
				fullName: true,
				phoneNumber: true,
				experience: true,
				hourPrice: true,
				imageUrl: true,
				level: true,
				portfolioLink: true,
				rating: true,
				specification: true,
			},
		});
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
	@Get('deleted') // BU ENDPOINT @Get(':id') DAN TEPADA TURISHI SHART!
	async getDeletedTeachers() {
		return this.teacherService.findDeleted();
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
	@Get(':id')
	findOne(@Param('id', ParseUUIDPipe) id: string) {
		return this.teacherService.findOneById(id, {
			select: {
				id: true,
				cardNumber: true,
				description: true,
				email: true,
				fullName: true,
				phoneNumber: true,
				experience: true,
				hourPrice: true,
				imageUrl: true,
				level: true,
				portfolioLink: true,
				rating: true,
				specification: true,
				createdAt: true,
				updatedAt: true,
			},
		});
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
	@Patch('activate/:id')
	teacherActivate(@Param('id', ParseUUIDPipe) id: string) {
		return this.teacherService.updateStatus(id);
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.SUPER_ADMIN)
	@Patch('restore/:id')
	restoreTeacher(@Param('id', ParseUUIDPipe) id: string) {
		return this.teacherService.restoreTeacher(id);
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.SUPER_ADMIN)
	@Delete('hard-delete/:id')
	hardDelete(@Param('id', ParseUUIDPipe) id: string) {
		return this.teacherService.delete(id);
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.TEACHER)
	@Patch('update')
	update(@CurrentUser() user: IToken, @Body() dto: UpdateTeacherDto) {
		return this.teacherService.updateTeacher(user.id, dto);
	}

	@ApiBearerAuth()
	@UseGuards(AuthGuard, RolesGuard)
	@AccessRoles(Roles.TEACHER)
	@Patch('changePassword')
	changePassword(@CurrentUser() user: IToken, @Body() dto: ChangePasswordDto) {
		return this.teacherService.changePassword(user.id, dto);
	}
}
