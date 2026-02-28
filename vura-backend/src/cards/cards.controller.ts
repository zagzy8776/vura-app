import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CardsService } from './cards.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('cards')
export class CardsController {
  constructor(private cardsService: CardsService) {}

  @UseGuards(AuthGuard)
  @Post()
  createCard(
    @Request() req: { user: { userId: string } },
    @Body() body: { type: 'Virtual' | 'Physical'; currency?: string },
  ) {
    return this.cardsService.createCard(
      req.user.userId,
      body.type,
      body.currency || 'NGN',
    );
  }

  @UseGuards(AuthGuard)
  @Get()
  getCards(@Request() req: { user: { userId: string } }) {
    return this.cardsService.getCards(req.user.userId);
  }

  @UseGuards(AuthGuard)
  @Put(':id/status')
  updateCardStatus(
    @Request() req: { user: { userId: string } },
    @Param('id') cardId: string,
    @Body() body: { status: 'active' | 'frozen' },
  ) {
    return this.cardsService.updateCardStatus(
      req.user.userId,
      cardId,
      body.status,
    );
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  deleteCard(
    @Request() req: { user: { userId: string } },
    @Param('id') cardId: string,
  ) {
    return this.cardsService.deleteCard(req.user.userId, cardId);
  }

  @UseGuards(AuthGuard)
  @Get(':id/pin')
  getCardPin(
    @Request() req: { user: { userId: string } },
    @Param('id') cardId: string,
  ) {
    return this.cardsService.getCardPin(req.user.userId, cardId);
  }
}
