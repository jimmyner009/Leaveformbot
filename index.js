require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

const FORM_CHANNEL_ID = process.env.FORM_CHANNEL_ID;        // ห้องที่วางปุ่ม
const ANNOUNCE_CHANNEL_ID = process.env.ANNOUNCE_CHANNEL_ID; // ห้องที่ประกาศลา

// ===== Helper: ส่งปุ่มไปที่ห้องฟอร์ม =====
async function sendFormButton() {
  const channel = await client.channels.fetch(FORM_CHANNEL_ID);
  if (!channel) throw new Error('FORM_CHANNEL_ID ไม่ถูกต้องหรือไม่พบช่อง');

  // เช็คสิทธิ์ขั้นต่ำ
  const perms = channel.permissionsFor(client.user);
  if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
    throw new Error('บอทไม่มีสิทธิ์ SendMessages ในห้องฟอร์ม');
  }

  const button = new ButtonBuilder()
    .setCustomId('open_leave_form')
    .setLabel('📋 กรอกฟอร์มลา')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(button);

  await channel.send({
    content: 'กรอกฟอร์มลาแก๊ง',
    components: [row],
  });
}

// ====== Ready ======
client.once(Events.ClientReady, async () => {
  console.log(`✅ บอทออนไลน์: ${client.user.tag}`);
  try {
    await sendFormButton();
  } catch (err) {
    console.error('❌ ส่งปุ่มไม่สำเร็จ:', err);
  }
});

// ====== กดปุ่ม → เปิด Modal ======
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'open_leave_form') return;

  try {
    const modal = new ModalBuilder()
      .setCustomId('submit_leave_form')
      .setTitle('📝 ฟอร์มลาแก๊ง');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('ชื่อ')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const dateInput = new TextInputBuilder()
      .setCustomId('date')
      .setLabel('วันที่ลา (เช่น 09/08, 09-10/08')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('เหตุผลที่ลา')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const rows = [
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(dateInput),
      new ActionRowBuilder().addComponents(reasonInput),
    ];

    await interaction.showModal(modal.addComponents(...rows));
  } catch (err) {
    console.error('❌ แสดง Modal ไม่สำเร็จ:', err);
    if (!interaction.replied) {
      await interaction.reply({ content: 'เกิดข้อผิดพลาดในการแสดงฟอร์ม', ephemeral: true });
    }
  }
});

// ====== Submit Modal → ส่งการ์ดไปห้องประกาศ ======
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== 'submit_leave_form') return;

  const name = interaction.fields.getTextInputValue('name') || '-';
  const dateRange = interaction.fields.getTextInputValue('date') || '-';
  const reason = interaction.fields.getTextInputValue('reason') || '-';

  try {
    const channel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID);
    if (!channel) throw new Error('ANNOUNCE_CHANNEL_ID ไม่ถูกต้องหรือไม่พบช่อง');

    const perms = channel.permissionsFor(client.user);
    if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
      throw new Error('บอทไม่มีสิทธิ์ SendMessages ในห้องประกาศ');
    }

    // ใช้ Embed ให้เป็น “การ์ด”
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📢 มีคนแจ้งลาแล้ว!')
      .addFields(
        { name: '👤 ชื่อ', value: name, inline: false },
        { name: '📅 วันที่ลา', value: dateRange, inline: false },
        { name: '📝 เหตุผล', value: reason, inline: false },
      )
      .setFooter({ text: 'ระบบฟอร์มลาแก๊ง ✨' })
      .setTimestamp();

    // แนบ mention ผู้ส่ง (optional)
    const content = `ผู้ส่ง: <@${interaction.user.id}>`;

    // ถ้าห้องไม่อนุญาต EmbedLinks จะ fallback เป็นข้อความธรรมดา
    if (!perms.has(PermissionsBitField.Flags.EmbedLinks)) {
      await channel.send(`📢 **${name}** แจ้งลา\n${dateRange}\n${reason}\n${content}`);
    } else {
      await channel.send({ content, embeds: [embed] });
    }

    await interaction.reply({ content: '✅ ส่งฟอร์มลาสำเร็จแล้ว!', ephemeral: true });
  } catch (err) {
    console.error('❌ ส่งประกาศไม่สำเร็จ:', err);
    const msg = err?.message?.includes('Missing Permissions')
      ? '❌ บอทไม่มีสิทธิ์ส่งข้อความ/Embed ในห้องประกาศ'
      : '❌ เกิดข้อผิดพลาดในการส่งประกาศ';
    if (!interaction.replied) {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

// ====== Error safety (กัน process ล้ม) ======
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

client.login(process.env.DISCORD_TOKEN);
