const ADMINISTRATOR_PROFILE = 'Administrador';
const AUTHENTICATED_BASELINE_PERMISSIONS = Object.freeze(['configuracoes.ver']);
// Predefinição de todos os perfis de sistema: abrir o dia e o turno (e fechar o
// próprio turno). São permissões normais — o administrador pode alterá-las.
const OPERATION_OPENING_PERMISSIONS = Object.freeze([
  'operacao.ver',
  'operacao.abrir_dia',
  'operacao.abrir_turno',
  'operacao.fechar_turno',
]);
// Permissões cujas predefinições mudaram na 1.0.6; a migração alinha os perfis
// de sistema já existentes com o catálogo (os perfis continuam editáveis).
const PERMISSIONS_REVISED_IN_1_0_6 = Object.freeze([
  ...OPERATION_OPENING_PERMISSIONS,
  'estoque.editar',
  'estoque.importar',
  'estoque.custo',
]);

function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    permissoes: Object.freeze([...profile.permissoes]),
  });
}

const PERMISSIONS = Object.freeze([
  { chave: 'dashboard.ver', modulo: 'Dashboard', acao: 'ver', descricao: 'Ver dashboard' },
  { chave: 'operacao.ver', modulo: 'Operacao', acao: 'ver', descricao: 'Ver abertura e fechamento operacional' },
  { chave: 'operacao.abrir_dia', modulo: 'Operacao', acao: 'abrir_dia', descricao: 'Abrir dia operacional' },
  { chave: 'operacao.fechar_dia', modulo: 'Operacao', acao: 'fechar_dia', descricao: 'Fechar dia operacional' },
  { chave: 'operacao.abrir_turno', modulo: 'Operacao', acao: 'abrir_turno', descricao: 'Abrir turno operacional' },
  { chave: 'operacao.fechar_turno', modulo: 'Operacao', acao: 'fechar_turno', descricao: 'Fechar turno operacional' },
  { chave: 'vendas.ver', modulo: 'Vendas', acao: 'ver', descricao: 'Ver vendas' },
  { chave: 'vendas.criar', modulo: 'Vendas', acao: 'criar', descricao: 'Criar vendas' },
  { chave: 'vendas.cancelar', modulo: 'Vendas', acao: 'cancelar', descricao: 'Cancelar vendas' },
  { chave: 'vendas.desconto', modulo: 'Vendas', acao: 'desconto', descricao: 'Aplicar descontos em vendas' },
  { chave: 'estoque.ver', modulo: 'Estoque', acao: 'ver', descricao: 'Ver estoque' },
  { chave: 'estoque.criar', modulo: 'Estoque', acao: 'criar', descricao: 'Criar itens de estoque' },
  { chave: 'estoque.editar', modulo: 'Estoque', acao: 'editar', descricao: 'Editar estoque' },
  { chave: 'estoque.apagar', modulo: 'Estoque', acao: 'apagar', descricao: 'Apagar itens de estoque' },
  { chave: 'estoque.importar', modulo: 'Estoque', acao: 'importar', descricao: 'Importar estoque' },
  { chave: 'financeiro.ver', modulo: 'Financeiro', acao: 'ver', descricao: 'Ver financeiro' },
  { chave: 'financeiro.criar', modulo: 'Financeiro', acao: 'criar', descricao: 'Criar transacoes financeiras' },
  { chave: 'financeiro.editar', modulo: 'Financeiro', acao: 'editar', descricao: 'Editar financeiro' },
  { chave: 'financeiro.apagar', modulo: 'Financeiro', acao: 'apagar', descricao: 'Apagar transacoes financeiras' },
  { chave: 'clientes.ver', modulo: 'Clientes', acao: 'ver', descricao: 'Ver clientes' },
  { chave: 'clientes.criar', modulo: 'Clientes', acao: 'criar', descricao: 'Criar clientes' },
  { chave: 'clientes.editar', modulo: 'Clientes', acao: 'editar', descricao: 'Editar clientes' },
  { chave: 'clientes.apagar', modulo: 'Clientes', acao: 'apagar', descricao: 'Apagar clientes' },
  { chave: 'documentos.ver', modulo: 'Documentos', acao: 'ver', descricao: 'Ver documentos' },
  { chave: 'documentos.imprimir', modulo: 'Documentos', acao: 'imprimir', descricao: 'Imprimir documentos' },
  { chave: 'documentos.anular', modulo: 'Documentos', acao: 'anular', descricao: 'Anular documentos' },
  { chave: 'documentos.exportar', modulo: 'Documentos', acao: 'exportar', descricao: 'Exportar documentos' },
  { chave: 'documentos.converter', modulo: 'Documentos', acao: 'converter', descricao: 'Converter documentos' },
  { chave: 'relatorios.ver', modulo: 'Relatorios', acao: 'ver', descricao: 'Ver relatorios' },
  { chave: 'relatorios.exportar', modulo: 'Relatorios', acao: 'exportar', descricao: 'Exportar relatorios' },
  { chave: 'configuracoes.ver', modulo: 'Configuracoes', acao: 'ver', descricao: 'Ver configuracoes' },
  { chave: 'configuracoes.editar', modulo: 'Configuracoes', acao: 'editar', descricao: 'Editar configuracoes' },
  { chave: 'usuarios.ver', modulo: 'Usuarios', acao: 'ver', descricao: 'Ver usuarios' },
  { chave: 'usuarios.criar', modulo: 'Usuarios', acao: 'criar', descricao: 'Criar usuarios' },
  { chave: 'usuarios.editar', modulo: 'Usuarios', acao: 'editar', descricao: 'Editar usuarios' },
  { chave: 'usuarios.inativar', modulo: 'Usuarios', acao: 'inativar', descricao: 'Inativar usuarios' },
  { chave: 'usuarios.resetar_senha', modulo: 'Usuarios', acao: 'resetar_senha', descricao: 'Redefinir senha de usuarios' },
  { chave: 'usuarios.gerir_permissoes', modulo: 'Usuarios', acao: 'gerir_permissoes', descricao: 'Gerir perfis e permissoes' },
  { chave: 'fornecedores.ver', modulo: 'Fornecedores', acao: 'ver', descricao: 'Ver fornecedores' },
  { chave: 'fornecedores.criar', modulo: 'Fornecedores', acao: 'criar', descricao: 'Criar fornecedores' },
  { chave: 'fornecedores.editar', modulo: 'Fornecedores', acao: 'editar', descricao: 'Editar fornecedores' },
  { chave: 'fornecedores.apagar', modulo: 'Fornecedores', acao: 'apagar', descricao: 'Apagar fornecedores' },
  { chave: 'compras.ver', modulo: 'Compras', acao: 'ver', descricao: 'Ver encomendas de compra' },
  { chave: 'compras.criar', modulo: 'Compras', acao: 'criar', descricao: 'Criar encomendas de compra' },
  { chave: 'compras.editar', modulo: 'Compras', acao: 'editar', descricao: 'Editar encomendas de compra' },
  { chave: 'compras.receber', modulo: 'Compras', acao: 'receber', descricao: 'Registar recepcao de encomendas' },
  { chave: 'compras.cancelar', modulo: 'Compras', acao: 'cancelar', descricao: 'Cancelar encomendas de compra' },
  { chave: 'estoque.ajustar', modulo: 'Estoque', acao: 'ajustar', descricao: 'Ajustar quantidades de estoque manualmente' },
  { chave: 'estoque.preco', modulo: 'Estoque', acao: 'preco', descricao: 'Actualizar precos de produtos' },
  { chave: 'estoque.custo', modulo: 'Estoque', acao: 'custo', descricao: 'Ver preco de custo dos produtos' },
].map((permission) => Object.freeze({ ...permission })));

const ALL_PERMISSION_KEYS = Object.freeze(PERMISSIONS.map((permission) => permission.chave));

const DEFAULT_PROFILES = Object.freeze([
  {
    nome: ADMINISTRATOR_PROFILE,
    descricao: 'Acesso total ao sistema',
    sistema: true,
    permissoes: ALL_PERMISSION_KEYS,
  },
  {
    nome: 'Farmaceutico',
    descricao: 'Atendimento, vendas, clientes, estoque e relatorios operacionais',
    sistema: true,
    permissoes: [
      'dashboard.ver',
      ...OPERATION_OPENING_PERMISSIONS,
      'vendas.ver',
      'vendas.criar',
      'vendas.desconto',
      'estoque.ver',
      'estoque.criar',
      'estoque.custo',
      'clientes.ver',
      'clientes.criar',
      'clientes.editar',
      'documentos.ver',
      'documentos.imprimir',
      'documentos.exportar',
      'relatorios.ver',
      'configuracoes.ver',
    ],
  },
  {
    nome: 'Caixa',
    descricao: 'Operacao de caixa e consulta basica',
    sistema: true,
    permissoes: [
      'dashboard.ver',
      ...OPERATION_OPENING_PERMISSIONS,
      'vendas.ver',
      'vendas.criar',
      'clientes.ver',
      'clientes.criar',
      'documentos.ver',
      'documentos.imprimir',
      'configuracoes.ver',
    ],
  },
  {
    nome: 'Gestor de Stock',
    descricao: 'Gestao de stock e consulta de relatorios',
    sistema: true,
    permissoes: [
      'dashboard.ver',
      ...OPERATION_OPENING_PERMISSIONS,
      'estoque.ver',
      'estoque.criar',
      'estoque.editar',
      'estoque.apagar',
      'estoque.importar',
      'estoque.ajustar',
      'estoque.preco',
      'estoque.custo',
      'fornecedores.ver',
      'fornecedores.criar',
      'fornecedores.editar',
      'compras.ver',
      'compras.criar',
      'compras.editar',
      'compras.receber',
      'documentos.ver',
      'documentos.imprimir',
      'documentos.anular',
      'documentos.exportar',
      'documentos.converter',
      'relatorios.ver',
      'configuracoes.ver',
    ],
  },
].map(freezeProfile));

function getPermissionKeys() {
  return [...ALL_PERMISSION_KEYS];
}

function getEssentialAdminPermissions() {
  return ['usuarios.ver', 'usuarios.editar', 'usuarios.gerir_permissoes'];
}

module.exports = {
  ADMINISTRATOR_PROFILE,
  AUTHENTICATED_BASELINE_PERMISSIONS,
  OPERATION_OPENING_PERMISSIONS,
  PERMISSIONS_REVISED_IN_1_0_6,
  PERMISSIONS,
  DEFAULT_PROFILES,
  getPermissionKeys,
  getEssentialAdminPermissions,
};
